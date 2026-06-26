import httpx
import json
from typing import List, Dict
from app.config import settings

# In-memory cache: key = (account_id, uid), value = classification result
_cache: dict = {}


async def classify_email(
    subject: str,
    sender: str,
    body_preview: str,
    categories: List[Dict],
    account_id: str,
    uid: str
) -> Dict:
    # Check cache first
    cache_key = (account_id, uid)
    if cache_key in _cache:
        return _cache[cache_key]

    categories_json = json.dumps([
        {
            "id": str(c["id"]),
            "name": c["name"],
            "priority": c["priority"],
            "description": c["description"],
            "keywords": c["keywords"]
        }
        for c in categories
    ])

    system_prompt = """You are an email classifier for a company.
You will be given an email and a list of categories with their descriptions and priorities.
Classify the email into exactly one category.
Return ONLY a valid JSON object with these exact keys:
{ "category_id": "uuid", "category_name": "string", "priority": "high|medium|low", "confidence_score": 0.0-1.0 }
No explanation, no markdown, no extra text. Just raw JSON."""

    user_prompt = f"""Categories:
{categories_json}

Email Subject: {subject}
Email From: {sender}
Email Body (preview): {body_preview}

Classify this email into one of the categories above."""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "mistralai/mistral-7b-instruct",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "max_tokens": 150
                }
            )
            data = response.json()
            raw = data["choices"][0]["message"]["content"].strip()
            # Strip markdown fences if present
            raw = raw.replace("```json", "").replace("```", "").strip()
            result = json.loads(raw)

            _cache[cache_key] = result
            return result

    except Exception:
        # Fallback if AI fails
        fallback = {
            "category_id": None,
            "category_name": "Uncategorized",
            "priority": "low",
            "confidence_score": 0.0
        }
        _cache[cache_key] = fallback
        return fallback