"""Declarative base for all ORM models."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base. Import all models in app/models/__init__.py so
    Alembic's autogenerate can discover them via Base.metadata."""
