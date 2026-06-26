import httpx

from app.config import settings


async def categorize_email(
    subject: str,
    body: str,
    categories: list[dict],
) -> dict | None:
    if not categories:
        return None

    category_list = "\n".join(
        f"- {c['name']}: {c.get('description') or 'No description'}"
        for c in categories
    )

    prompt = (
        "Classify this email into exactly one category from the list below.\n"
        f"Categories:\n{category_list}\n\n"
        f"Subject: {subject}\n"
        f"Body: {body[:1000]}\n\n"
        "Reply with only the category name."
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "openai/gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        response.raise_for_status()
        category_name = response.json()["choices"][0]["message"]["content"].strip()

    for category in categories:
        if category["name"].lower() == category_name.lower():
            return category

    return {"name": category_name, "matched": False}
