from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, default="")
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=True)
    google_id = Column(String(255), unique=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
