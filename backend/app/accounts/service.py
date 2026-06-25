import imaplib
from cryptography.fernet import Fernet
from app.config import settings

fernet = Fernet(settings.ENCRYPTION_KEY.encode())

def encrypt_password(plain: str) -> str:
    return fernet.encrypt(plain.encode()).decode()

def decrypt_password(encrypted: str) -> str:
    return fernet.decrypt(encrypted.encode()).decode()

def test_imap_connection(email_address: str, app_password: str) -> bool:
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(email_address, app_password)
        mail.logout()
        return True
    except Exception:
        return False