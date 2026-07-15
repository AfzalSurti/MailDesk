import json
import re
import uuid
from typing import List, Dict, Optional

from app.emails.openrouter_client import OpenRouterError, openrouter

_cache: dict = {}


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

    categories_json = json.dumps(
        [
            {
                "id": str(c["id"]),
                "name": c["name"],
                "priority": c["priority"],
                "description": c["description"],
                "keywords": c["keywords"],
            }
            for c in categories
        ],
        indent=2,
    )

    system_prompt = """You classify company inbox emails into exactly ONE category from the provided list.

Rules:
- Security codes, 2-step verification, Google/Microsoft login alerts → Security & Authentication
- Job boards, recruiters, internships ONLY when clearly about jobs → Job Opportunities
- Invoices, payments, receipts → Finance & Billing
- Newsletters, promotions, ads → Marketing & Newsletters
- Anything else → General Updates

Respond with ONLY valid JSON, no markdown:
{"category_id": "<uuid from list>", "category_name": "<exact name from list>", "priority": "high|medium|low", "confidence_score": 0.85}"""

    user_prompt = f"""Categories:
{categories_json}

Email:
Subject: {subject}
From: {sender}
Preview: {body_preview[:400]}"""

    try:
        raw = await openrouter.chat_completions(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=120,
            temperature=0.1,
            timeout=45.0,
        )
        raw = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
        result = normalize_classification(parsed, categories)

        if not result:
            general = _find_category(categories, "general")
            result = _make_result(general, 0.5) if general else _uncategorized()

        _cache[cache_key] = result
        return result

    except OpenRouterError as exc:
        raise ClassificationAPIError(str(exc), status_code=exc.status_code) from exc
    except json.JSONDecodeError as exc:
        raise ClassificationAPIError(
            "OpenRouter returned invalid JSON for classification. Try again."
        ) from exc


def parse_category_uuid(value: Optional[str]) -> Optional[uuid.UUID]:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None
