from ..database import SessionLocal, init_db
from . import load_dev_examples

init_db()
db = SessionLocal()
try:
    created = load_dev_examples(db)
    print(f"Created {len(created)} example flowchart(s).")
finally:
    db.close()
