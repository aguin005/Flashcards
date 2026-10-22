"""Create the password-protected PDF fixture (password: study123). Requires: pip install pypdf"""
from pathlib import Path
from pypdf import PdfReader, PdfWriter

fixtures = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
writer = PdfWriter(clone_from=PdfReader(fixtures / "vocab-notes.pdf"))
writer.encrypt(user_password="study123", owner_password="owner-study123", algorithm="AES-128")
with open(fixtures / "password-protected.pdf", "wb") as f:
    writer.write(f)
print("wrote", fixtures / "password-protected.pdf")
