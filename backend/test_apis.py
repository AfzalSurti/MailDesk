"""Run: python test_apis.py"""
import asyncio
import sys

import httpx

BASE = "http://127.0.0.1:8000"
ADMIN_USER = "admin@company.com"
ADMIN_PASS = "admin123"

results: list[tuple[str, str, int, str]] = []


def record(name: str, method: str, status: int, detail: str, expected: int | None = None):
    ok = "PASS" if status in (200, 201, 204) or status == expected else "FAIL"
    results.append((ok, name, status, detail))
    print(f"  [{ok}] {method} {name} -> {status} {detail}")


async def main():
    async with httpx.AsyncClient(base_url=BASE, timeout=60.0) as client:
        # 1. Health
        r = await client.get("/health")
        record("/health", "GET", r.status_code, r.text[:80])

        # 2. Login (OAuth2 form)
        r = await client.post(
            "/auth/login",
            data={"username": ADMIN_USER, "password": ADMIN_PASS},
        )
        if r.status_code != 200:
            record("/auth/login", "POST", r.status_code, r.text[:120])
            print("\nCannot continue without token.")
            _summary()
            sys.exit(1)

        token = r.json()["access_token"]
        record("/auth/login", "POST", r.status_code, "token received")
        headers = {"Authorization": f"Bearer {token}"}

        # 3. Login bad creds
        r = await client.post(
            "/auth/login",
            data={"username": ADMIN_USER, "password": "wrong"},
        )
        record("/auth/login (bad pass)", "POST", r.status_code, "rejected", expected=401)

        # 4. Categories - list
        r = await client.get("/categories/", headers=headers)
        record("/categories/", "GET", r.status_code, f"{len(r.json())} items" if r.status_code == 200 else r.text[:80])

        # 5. Categories - create
        cat_body = {
            "name": "Test API Category",
            "priority": "high",
            "description": "auto test",
            "keywords": ["test", "api"],
        }
        r = await client.post("/categories/", json=cat_body, headers=headers)
        cat_id = r.json().get("id") if r.status_code == 201 else None
        record("/categories/", "POST", r.status_code, cat_id or r.text[:80])

        # 6. Categories - duplicate (expect 400)
        r = await client.post("/categories/", json=cat_body, headers=headers)
        record("/categories/ (duplicate)", "POST", r.status_code, "duplicate blocked", expected=400)

        # 7. Categories - no auth (expect 401)
        r = await client.get("/categories/")
        record("/categories/ (no auth)", "GET", r.status_code, "unauthorized", expected=401)

        # 8. Accounts - list
        r = await client.get("/accounts/", headers=headers)
        record("/accounts/", "GET", r.status_code, f"{len(r.json())} items" if r.status_code == 200 else r.text[:80])

        # 9. Accounts - create with fake creds (expect 400 IMAP fail)
        r = await client.post(
            "/accounts/",
            json={
                "email_address": "fake@gmail.com",
                "app_password": "fakepass",
                "display_name": "Test",
            },
            headers=headers,
        )
        record("/accounts/ (bad imap)", "POST", r.status_code, "imap rejected", expected=400)

        # 10. Emails sync - no accounts (expect 404)
        r = await client.get("/emails/sync", headers=headers)
        record("/emails/sync (no accounts)", "GET", r.status_code, "no accounts", expected=404)

        # 11. Emails categorize
        r = await client.post(
            "/emails/categorize",
            json={"subject": "Invoice due", "body": "Please pay your invoice by Friday"},
            headers=headers,
        )
        record("/emails/categorize", "POST", r.status_code, str(r.json())[:80] if r.status_code == 200 else r.text[:80])

        # 12. Delete category cleanup
        if cat_id:
            r = await client.delete(f"/categories/{cat_id}", headers=headers)
            record(f"/categories/{cat_id}", "DELETE", r.status_code, "deleted" if r.status_code == 204 else r.text[:80])

        # 13. Delete missing category (expect 404)
        r = await client.delete(
            "/categories/00000000-0000-0000-0000-000000000000",
            headers=headers,
        )
        record("/categories/{missing}", "DELETE", r.status_code, "not found", expected=404)

    _summary()


def _summary():
    passed = sum(1 for r in results if r[0] == "PASS")
    failed = sum(1 for r in results if r[0] == "FAIL")
    print(f"\n{'='*50}")
    print(f"TOTAL: {len(results)}  PASSED: {passed}  FAILED: {failed}")
    if failed:
        print("\nFailed:")
        for ok, name, status, detail in results:
            if ok == "FAIL":
                print(f"  - {name} ({status}): {detail}")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
