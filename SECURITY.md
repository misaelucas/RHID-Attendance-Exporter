# Security and privacy

This repository must contain source code and anonymized documentation only. RHID credentials, browser sessions, employee data, generated reports, screenshots, network captures, and archives containing any of those files must never be committed.

## Local configuration

Copy `.env.example` to `.env` and set `RHID_EMAIL` and `RHID_PASSWORD` locally. `.env` files other than `.env.example` are ignored by Git. Never place real values in `.env.example`.

## Generated and captured data

Keep generated output under `exports/`, `downloads/`, or `logs/`. Their contents are ignored. Browser state belongs under `.auth/`, which is also ignored.

Before committing, inspect the staged file list:

```bash
git diff --cached --name-only
```

Do not commit PDFs, spreadsheets, CSV files, HAR captures, cookie or storage-state files, compressed archives, or samples containing real employee names, IDs, CPF/PIS values, e-mail addresses, attendance records, or hour-bank balances.

If sensitive data reaches any commit, deleting it in a later commit is not sufficient: rotate exposed credentials where applicable and rewrite or replace the repository history before publishing it.
