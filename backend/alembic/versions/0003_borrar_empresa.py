"""la auditoría solo admite borrar la empresa que se está eliminando"""

from alembic import op

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None

GUARDED = """
create or replace function audit_events_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.company_id::text = current_setting('app.purge_company', true) then
    return old;
  end if;
  raise exception 'audit_events es de solo inserción';
end $$
"""
ORIGINAL = """
create or replace function audit_events_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_events es de solo inserción';
end $$
"""


def upgrade() -> None:
    op.execute(GUARDED)


def downgrade() -> None:
    op.execute(ORIGINAL)
