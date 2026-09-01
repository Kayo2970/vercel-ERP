# LEADS Next Gen All-in-One Dashboard

This repository contains the private internal operations and management dashboard for the **LEADS Next Gen Centre at M.S. Ramaiah University of Applied Sciences (MSRUAS), Bengaluru**. It consolidates task traceability, event management, performance evaluation, dual-level reimbursement pipelines, dynamic public form building, and member roster management into a single, cohesive portal.

---

## 📂 Project Structure

- **`leads-dashboard/`**: The Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 project containing the active implementation of the dashboard.
- **`PROJECT DOCS/`**: Curated product specifications, sitemaps, database models, technical specifications, and copywriting guidelines.
- **`REFERENCE DATA/`**: Official Ramaiah University of Applied Sciences leadership directory, hierarchy structure, source images, and references.
- **`docs/`**: Engineering manuals, deployment guides, database schemas, and the complete [Operations & Privileges Manual (DOCX)](docs/LEADS_ERP_Instruction_and_Privileges_Manual.docx).

---

## 🚀 Getting Started & First-Time Setup

### 1. Local Development Server

```bash
# Navigate to the project directory
cd leads-dashboard

# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🪄 One-Time Initial Setup Wizard

On a fresh installation (locally or on a production VPS), the application automatically detects that no accounts exist and enters the **One-Time Initial Setup Wizard**:

1. **Step 1: Super User Account Provisioning**
   - Enter the root Super User's Full Name, Email Address, and Master Password (min 8 characters).
   - The password is cryptographically hashed using **scrypt** with a random per-user salt.
   - The instance starts clean with **zero hardcoded members**.
2. **Step 2: Database Server-Side Encryption Key (`DATA_ENCRYPTION_KEY`)**
   - Automatically generate a cryptographically strong 256-bit hexadecimal key (or enter a custom passphrase).
   - The key is saved permanently to `.env` on the server and used to encrypt all local database collections via **AES-256-GCM**.
   - A backup alert reminds the operator to store this key in a secure offline password manager.

> **Permanent Lock:** Once the initial setup is completed, the wizard is permanently locked. Future visitors to `/` or `/setup` are taken straight to the normal Sign-In portal.

Alternatively, CLI operators can run the bootstrap script directly in their terminal:
```bash
npm run setup
# or: node scripts/setup-superuser.js
```

---

## 🖥️ Self-Hosted Deployment (Hostinger KVM VPS)

The application runs as a production service under **PM2** on a self-hosted Hostinger KVM VPS at **[leadsnextgencentre.online](https://leadsnextgencentre.online)**, reverse-proxied with **Nginx** and automated SSL.

### Deployment Workflow:
1. Develop, test, and commit locally to git.
2. Push commits to `main`.
3. On the VPS:
   ```bash
   git pull
   npm install
   npm run build
   pm2 restart leads-dashboard
   ```
4. All client browsers synchronize with the VPS over HTTPS.

### Data Persistence & Encryption:
- Database files reside under `leads-dashboard/data/` as per-collection JSON files (`members.json`, `events.json`, `tasks.json`, etc.).
- Each file is encrypted at rest using **AES-256-GCM** using the `DATA_ENCRYPTION_KEY` in `.env`.
- Uploaded assets (Design Portal images, reimbursement receipts) are stored on disk under `data/uploads/`.
- **Live Sync:** Connected clients automatically poll every 7 seconds, pulling live updates into local context.

---

## 🔐 Access Level Tiers & Privileges Matrix

| Tier | Role Title | Typical Division | Core Permissions & Scope |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **Super User** | Core Committee | Complete system governance, dynamic Quick Switch impersonator, system lockdown, global audit logs, backup/restore. |
| **Tier 2** | **Centre Head** | Faculty | University-wide operational authority, final budget sign-off, Level-2 reimbursement clearance, email broadcasts, guest directory. |
| **Tier 2.5** | **GG Campus Head** | Faculty | Regional operational authority and event oversight for the Gnanagangothri (GG) campus. |
| **Tier 3** | **Faculty / Event Heads** | Faculty | Event proposal approval, Level-1 reimbursement audit, student task lead delegation, rating reviews. |
| **Tier 4** | **Advisory Board** | Faculty | Read-only access to institutional analytics, event summaries, and evaluation reports. |
| **Tier 5** | **Core Committee** | Core Committee | Executive Council (President & Vice President) hold universal task oversight across the platform; Event orchestration, task assignments, public form builder & QR generation, financial claims. Festival events require post sign-off to appear in dropdowns. |
| **Tier 6** | **Training Associates** | Training Associate | Task execution & status updates, personal workspace, expense claim submission, feedback participation. |
| **Tier 7** | **Alumni / Guests** | Alumni / Guest | Read-only historical event records, guest invites, and certificate downloads. |

---

## ⚡ Super User Features

- **Dynamic Quick Switch:** The Super User can instantly impersonate any active account in the Directory without entering a password. The switcher queries the live database in real time. A prominent top bar allows one-click return to the Super User session.
- **Emergency Lockdown Mode:** Instantly restricts non-Super-User access in case of administrative maintenance.
- **Encrypted Backup & Restore:** Export complete AES-256 encrypted snapshots of the database with offline decryptor tool (`scripts/decrypt-backup.js`).

---

## 📄 Comprehensive Operations Manual

A formal Microsoft Word document detailing all workflows, security protocols, and module guidelines is available in the repository:
- **[LEADS ERP Operations & Privileges Manual (DOCX)](docs/LEADS_ERP_Instruction_and_Privileges_Manual.docx)**

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (Turbopack, App Router) & React 19
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4 & custom glassmorphism design system
- **Cryptography**: Node.js `crypto` (`scrypt`, `AES-256-GCM`, `PBKDF2`)
- **Charts & Visualization**: Recharts
- **PDF & QR Engines**: `jspdf`, `jspdf-autotable`, `qrcode`, `html2canvas`
- **OCR & Spellcheck**: `tesseract.js`, `nspell`
- **Email Relay**: `nodemailer` with local Postfix relay

---

© 2026 LEADS Next Gen Centre, M.S. Ramaiah University of Applied Sciences. All rights reserved.
