import json
import re
import uuid
from typing import List, Dict, Optional

from app.emails.openrouter_client import OpenRouterError, openrouter

_cache: dict = {}

# Batch size keeps quality high while cutting API calls ~8x
CLASSIFY_BATCH_SIZE = 8

_SYSTEM_PROMPT = """You classify company inbox emails into exactly ONE category from the provided list.

Rules:
- Security codes, 2-step verification, Google/Microsoft login alerts → Security & Authentication
- Job boards, recruiters, internships ONLY when clearly about jobs → Job Opportunities
- Invoices, payments, receipts → Finance & Billing
- Newsletters, promotions, ads → Marketing & Newsletters
- Anything else → General Updates

Respond with ONLY valid JSON, no markdown."""


class ClassificationAPIError(Exception):
    """Raised when OpenRouter AI classification fails."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _find_category(categories: List[Dict], *name_parts: str) -> Optional[dict]:
    for cat in categories:
        lower = cat["name"].lower()
        if any(part.lower() in lower for part in name_parts):
            return cat
    return None


def _make_result(cat: dict, confidence: float) -> dict:
    return {
        "category_id": str(cat["id"]),
        "category_name": cat["name"],
        "priority": cat["priority"],
        "confidence_score": confidence,
    }


def _uncategorized() -> dict:
    return {
        "category_id": None,
        "category_name": None,
        "priority": None,
        "confidence_score": None,
    }


def _fallback_result(categories: List[Dict]) -> dict:
    general = _find_category(categories, "general")
    return _make_result(general, 0.5) if general else _uncategorized()


def _categories_payload(categories: List[Dict]) -> str:
    """Same category fields as before, compact JSON (fewer tokens)."""
    return json.dumps(
        [
            {
                "id": str(c["id"]),
                "name": c["name"],
                "priority": c["priority"],
                "description": c.get("description") or "",
                "keywords": c.get("keywords") or [],
            }
            for c in categories
        ],
        separators=(",", ":"),
        ensure_ascii=False,
    )


def rule_based_classify(
    subject: str,
    sender: str,
    body_preview: str,
    categories: List[Dict],
) -> Optional[dict]:
    text = f"{subject} {sender} {body_preview}".lower()
    sender_l = sender.lower()

    security_cat = _find_category(categories, "security", "authentication")
    if security_cat:
        security_senders = (
            "google.com",
            "accounts.google",
            "microsoft.com",
            "apple.com",
            "github.com",
        )
        security_phrases = (
            "verification code",
            "verify your",
            "two-step",
            "2-step verification",
            "two factor",
            "2fa",
            "security alert",
            "sign-in attempt",
            "login attempt",
            "authentication code",
            "password reset",
        )
        if any(s in sender_l for s in security_senders) and any(
            p in text for p in security_phrases
        ):
            return _make_result(security_cat, 0.95)
        if any(p in text for p in security_phrases):
            return _make_result(security_cat, 0.9)

    finance_cat = _find_category(categories, "finance", "billing")
    if finance_cat and re.search(
        r"\b(invoice|payment due|billing statement|receipt|amount due)\b", text
    ):
        return _make_result(finance_cat, 0.88)

    job_cat = _find_category(categories, "job", "opportunit")
    if job_cat and re.search(
        r"\b(job alert|vacancies|vacancy|hiring|recruiter|internship|career opportunity)\b",
        text,
    ):
        if not any(s in sender_l for s in ("google.com", "accounts.google")):
            return _make_result(job_cat, 0.85)

    marketing_cat = _find_category(categories, "marketing", "newsletter")
    if marketing_cat and re.search(
        r"\b(unsubscribe|newsletter|promotional|% off|limited time offer)\b", text
    ):
        return _make_result(marketing_cat, 0.85)

    return None


def normalize_classification(result: dict, categories: List[Dict]) -> Optional[dict]:
    by_id = {str(c["id"]): c for c in categories}
    by_name = {c["name"].lower(): c for c in categories}

    raw_id = result.get("category_id")
    raw_name = (result.get("category_name") or "").strip().lower()

    matched = None
    if raw_id and str(raw_id) in by_id:
        matched = by_id[str(raw_id)]
    elif raw_name and raw_name in by_name:
        matched = by_name[raw_name]
    elif raw_name and len(raw_name) >= 3:
        for cat in categories:
            cat_lower = cat["name"].lower()
            if cat_lower == raw_name or cat_lower in raw_name or raw_name in cat_lower:
                matched = cat
                break

    if not matched:
        return None

    confidence = result.get("confidence_score", 0.0)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    return {
        "category_id": str(matched["id"]),
        "category_name": matched["name"],
        "priority": matched["priority"],
        "confidence_score": max(0.0, min(1.0, confidence)),
    }


def _finalize_ai_result(parsed: dict, categories: List[Dict]) -> dict:
    result = normalize_classification(parsed, categories)
    if not result:
        return _fallback_result(categories)
    return result


def _parse_json_content(raw: str):
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)


async def _classify_via_api_single(
    subject: str,
    sender: str,
    body_preview: str,
    categories: List[Dict],
) -> dict:
    categories_json = _categories_payload(categories)
    user_prompt = (
        f"Categories:\n{categories_json}\n\n"
        f"Email:\nSubject: {subject}\nFrom: {sender}\n"
        f"Preview: {(body_preview or '')[:400]}\n\n"
        'Respond with ONLY valid JSON:\n'
        '{"category_id":"<uuid from list>","category_name":"<exact name from list>",'
        '"priority":"high|medium|low","confidence_score":0.85}'
    )
    raw = await openrouter.chat_completions(
        [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=120,
        temperature=0.1,
        timeout=45.0,
    )
    parsed = _parse_json_content(raw)
    return _finalize_ai_result(parsed, categories)


async def _classify_via_api_batch(
    items: List[Dict],
    categories: List[Dict],
) -> Dict[str, dict]:
    """Classify several emails in one request. Same rules / normalize as single."""
    categories_json = _categories_payload(categories)
    emails_block = []
    for item in items:
        emails_block.append(
            {
                "uid": str(item["uid"]),
                "subject": item.get("subject") or "",
                "from": item.get("sender") or "",
                "preview": (item.get("body_preview") or "")[:400],
            }
        )

    user_prompt = (
        f"Categories:\n{categories_json}\n\n"
        f"Emails (classify each independently):\n"
        f"{json.dumps(emails_block, separators=(',', ':'), ensure_ascii=False)}\n\n"
        "Respond with ONLY valid JSON object:\n"
        '{"results":[{"uid":"<same uid>","category_id":"<uuid from list>",'
        '"category_name":"<exact name from list>","priority":"high|medium|low",'
        '"confidence_score":0.85}]}'
    )

    raw = await openrouter.chat_completions(
        [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=min(120 * len(items) + 80, 1200),
        temperature=0.1,
        timeout=90.0,
    )
    parsed = _parse_json_content(raw)
    rows = parsed.get("results") if isinstance(parsed, dict) else None
    if not isinstance(rows, list):
        raise ClassificationAPIError(
            "OpenRouter returned invalid batch classification JSON"
        )

    out: Dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        uid = str(row.get("uid") or "")
        if not uid:
            continue
        out[uid] = _finalize_ai_result(row, categories)
    return out


async def classify_email(
    subject: str,
    sender: str,
    body_preview: str,
    categories: List[Dict],
    account_id: str,
    uid: str,
    force: bool = False,
) -> dict:
    cache_key = (account_id, uid)

    if force:
        _cache.pop(cache_key, None)
    elif cache_key in _cache:
        return _cache[cache_key]

    if not categories:
        return _uncategorized()

    if not openrouter.configured:
        raise ClassificationAPIError(
            "OpenRouter API key is not configured. Set OPENROUTER_API_KEY (or API_KEY) in backend .env"
        )

    rule_result = rule_based_classify(subject, sender, body_preview, categories)
    if rule_result:
        _cache[cache_key] = rule_result
        return rule_result

    try:
        result = await _classify_via_api_single(
            subject, sender, body_preview, categories
        )
        _cache[cache_key] = result
        return result
    except OpenRouterError as exc:
        raise ClassificationAPIError(str(exc), status_code=exc.status_code) from exc
    except json.JSONDecodeError as exc:
        raise ClassificationAPIError(
            "OpenRouter returned invalid JSON for classification. Try again."
        ) from exc


async def classify_emails_batch(
    items: List[Dict],
    categories: List[Dict],
    account_id: str,
    force: bool = False,
    on_api_batch=None,
    after_api_batch=None,
) -> Dict[str, dict]:
    """Classify many emails with rule cache first, then batched OpenRouter calls.

    Each item: ``{uid, subject, sender, body_preview}``.
    Returns ``{uid: classification}``. Same quality path as ``classify_email``.
    ``on_api_batch`` runs before each OpenRouter request; ``after_api_batch(n)`` after success.
    """
    results: Dict[str, dict] = {}
    if not items:
        return results
    if not categories:
        for item in items:
            results[str(item["uid"])] = _uncategorized()
        return results
    if not openrouter.configured:
        raise ClassificationAPIError(
            "OpenRouter API key is not configured. Set OPENROUTER_API_KEY (or API_KEY) in backend .env"
        )

    need_ai: List[Dict] = []
    for item in items:
        uid = str(item["uid"])
        cache_key = (account_id, uid)
        if force:
            _cache.pop(cache_key, None)
        elif cache_key in _cache:
            results[uid] = _cache[cache_key]
            continue

        rule_result = rule_based_classify(
            item.get("subject") or "",
            item.get("sender") or "",
            item.get("body_preview") or "",
            categories,
        )
        if rule_result:
            _cache[cache_key] = rule_result
            results[uid] = rule_result
            continue
        need_ai.append(item)

    for i in range(0, len(need_ai), CLASSIFY_BATCH_SIZE):
        chunk = need_ai[i : i + CLASSIFY_BATCH_SIZE]
        if on_api_batch:
            await on_api_batch()
        try:
            batch_out = await _classify_via_api_batch(chunk, categories)
            if after_api_batch:
                await after_api_batch(len(chunk))
        except OpenRouterError as exc:
            raise ClassificationAPIError(
                str(exc), status_code=exc.status_code
            ) from exc
        except (json.JSONDecodeError, ClassificationAPIError):
            # Quality fallback: classify missing ones one-by-one with same rules
            batch_out = {}
            for item in chunk:
                uid = str(item["uid"])
                if on_api_batch:
                    await on_api_batch()
                try:
                    batch_out[uid] = await _classify_via_api_single(
                        item.get("subject") or "",
                        item.get("sender") or "",
                        item.get("body_preview") or "",
                        categories,
                    )
                    if after_api_batch:
                        await after_api_batch(1)
                except OpenRouterError as exc:
                    raise ClassificationAPIError(
                        str(exc), status_code=exc.status_code
                    ) from exc
                except json.JSONDecodeError as exc:
                    raise ClassificationAPIError(
                        "OpenRouter returned invalid JSON for classification. Try again."
                    ) from exc

        for item in chunk:
            uid = str(item["uid"])
            if uid in batch_out:
                result = batch_out[uid]
            else:
                # Missing uid in batch response — same single-call path
                if on_api_batch:
                    await on_api_batch()
                try:
                    result = await _classify_via_api_single(
                        item.get("subject") or "",
                        item.get("sender") or "",
                        item.get("body_preview") or "",
                        categories,
                    )
                    if after_api_batch:
                        await after_api_batch(1)
                except OpenRouterError as exc:
                    raise ClassificationAPIError(
                        str(exc), status_code=exc.status_code
                    ) from exc
                except json.JSONDecodeError as exc:
                    raise ClassificationAPIError(
                        "OpenRouter returned invalid JSON for classification. Try again."
                    ) from exc
            _cache[(account_id, uid)] = result
            results[uid] = result

    return results


def parse_category_uuid(value: Optional[str]) -> Optional[uuid.UUID]:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None
