FROM python:3.12-slim

WORKDIR /srv
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
COPY alembic.ini ./
COPY alembic ./alembic
COPY seeds ./seeds
RUN useradd --create-home app && chown -R app /srv
USER app
EXPOSE 8000
