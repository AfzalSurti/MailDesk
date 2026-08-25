import imaplib
from cryptography.fernet import Fernet, InvalidToken
from app.config import settings

fernet = Fernet(settings.ENCRYPTION_KEY.encode())

def encrypt_password(plain: str) -> str:
    return fernet.encrypt(plain.encode()).decode()

def decrypt_password(encrypted: str) -> str:
    try:
        return fernet.decrypt(encrypted.encode()).decode()
    except InvalidToken as exc:
        raise ValueError(
            "Could not decrypt Gmail app password. "
            "ENCRYPTION_KEY on this server does not match the key used when the account was added. "
            "Copy the same ENCRYPTION_KEY from Render, or delete and re-add each Gmail account."
        ) from exc

def test_imap_connection(email_address: str, app_password: str) -> bool:
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(email_address, app_password)
        mail.logout()
        return True
    except Exception:
        return False
