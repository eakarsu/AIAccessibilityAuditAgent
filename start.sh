#!/usr/bin/env bash
###############################################################################
# AI Accessibility Audit Agent - Startup Script
# Initializes database, installs dependencies, seeds data, and starts servers.
###############################################################################
set -euo pipefail

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
success() { echo -e "${GREEN}[OK]${NC}      $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }
error()   { echo -e "${RED}[ERROR]${NC}   $*"; }
header()  { echo -e "\n${MAGENTA}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}${BOLD}  $*${NC}"; echo -e "${MAGENTA}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"; }

# ---------------------------------------------------------------------------
# Project root (directory where this script lives)
# ---------------------------------------------------------------------------
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# ---------------------------------------------------------------------------
# Load environment
# ---------------------------------------------------------------------------
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
  success "Loaded .env"
else
  error ".env file not found – copy .env.example to .env and configure it."
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-accessibility_audit}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

export PGPASSWORD="$DB_PASSWORD"

# ---------------------------------------------------------------------------
# Cleanup on exit
# ---------------------------------------------------------------------------
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  warn "Shutting down..."
  [[ -n "$BACKEND_PID" ]]  && kill "$BACKEND_PID"  2>/dev/null && info "Stopped backend (PID $BACKEND_PID)"
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null && info "Stopped frontend (PID $FRONTEND_PID)"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ---------------------------------------------------------------------------
# 1. Kill existing processes on ports 3000 and 3001
# ---------------------------------------------------------------------------
header "1/6  Freeing ports $FRONTEND_PORT and $BACKEND_PORT"

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    success "Killed process(es) on port $port"
  else
    info "Port $port is already free"
  fi
}

kill_port "$FRONTEND_PORT"
kill_port "$BACKEND_PORT"
sleep 1

# ---------------------------------------------------------------------------
# 2. PostgreSQL – ensure the database exists
# ---------------------------------------------------------------------------
header "2/6  Setting up PostgreSQL database"

if ! command -v psql &>/dev/null; then
  error "psql not found. Please install PostgreSQL."
  exit 1
fi

# Check if Postgres is running
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -q 2>/dev/null; then
  warn "PostgreSQL does not appear to be running. Attempting to start it..."
  if command -v brew &>/dev/null; then
    brew services start postgresql@16 2>/dev/null || brew services start postgresql@15 2>/dev/null || brew services start postgresql 2>/dev/null || true
  fi
  sleep 2
  if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -q 2>/dev/null; then
    error "Cannot connect to PostgreSQL at $DB_HOST:$DB_PORT. Please start it manually."
    exit 1
  fi
fi
success "PostgreSQL is running"

# Create database if it doesn't exist
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  info "Database '$DB_NAME' already exists"
else
  createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null || true
  success "Created database '$DB_NAME'"
fi

# Enable extensions
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" -q 2>/dev/null || true

# ---------------------------------------------------------------------------
# 3. Run migrations (create tables)
# ---------------------------------------------------------------------------
header "3/6  Running database migrations"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q <<'MIGRATIONS'

-- =========================================================================
-- USERS
-- =========================================================================
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    role            VARCHAR(50) DEFAULT 'auditor',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- CLIENTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS clients (
    id              SERIAL PRIMARY KEY,
    company_name    VARCHAR(255) NOT NULL,
    contact_name    VARCHAR(255),
    contact_email   VARCHAR(255),
    website_url     VARCHAR(500),
    industry        VARCHAR(100),
    subscription_tier VARCHAR(50) DEFAULT 'basic',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- SITE AUDITS
-- =========================================================================
CREATE TABLE IF NOT EXISTS site_audits (
    id              SERIAL PRIMARY KEY,
    client_id       INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    url             VARCHAR(500) NOT NULL,
    audit_type      VARCHAR(50) DEFAULT 'full',
    status          VARCHAR(50) DEFAULT 'pending',
    overall_score   NUMERIC(5,2),
    pages_scanned   INTEGER DEFAULT 0,
    issues_found    INTEGER DEFAULT 0,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- WCAG CHECKS
-- =========================================================================
CREATE TABLE IF NOT EXISTS wcag_checks (
    id              SERIAL PRIMARY KEY,
    audit_id        INTEGER REFERENCES site_audits(id) ON DELETE CASCADE,
    criterion_id    VARCHAR(20) NOT NULL,
    criterion_name  VARCHAR(255) NOT NULL,
    level           VARCHAR(5) NOT NULL,
    status          VARCHAR(50) DEFAULT 'not_tested',
    details         TEXT,
    page_url        VARCHAR(500),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- ACCESSIBILITY ISSUES
-- =========================================================================
CREATE TABLE IF NOT EXISTS accessibility_issues (
    id              SERIAL PRIMARY KEY,
    audit_id        INTEGER REFERENCES site_audits(id) ON DELETE CASCADE,
    issue_type      VARCHAR(100) NOT NULL,
    severity        VARCHAR(20) NOT NULL,
    wcag_criterion  VARCHAR(20),
    element_selector VARCHAR(500),
    description     TEXT NOT NULL,
    page_url        VARCHAR(500),
    screenshot_url  VARCHAR(500),
    is_resolved     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- FIX SUGGESTIONS
-- =========================================================================
CREATE TABLE IF NOT EXISTS fix_suggestions (
    id              SERIAL PRIMARY KEY,
    issue_id        INTEGER REFERENCES accessibility_issues(id) ON DELETE CASCADE,
    suggestion_text TEXT NOT NULL,
    code_before     TEXT,
    code_after      TEXT,
    ai_confidence   NUMERIC(5,2),
    is_applied      BOOLEAN DEFAULT FALSE,
    applied_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- ADA REPORTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS ada_reports (
    id              SERIAL PRIMARY KEY,
    audit_id        INTEGER REFERENCES site_audits(id) ON DELETE CASCADE,
    client_id       INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    report_type     VARCHAR(50) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    summary         TEXT,
    compliance_level VARCHAR(20),
    total_issues    INTEGER DEFAULT 0,
    critical_issues INTEGER DEFAULT 0,
    pdf_url         VARCHAR(500),
    generated_at    TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- COLOR CONTRAST ANALYSES
-- =========================================================================
CREATE TABLE IF NOT EXISTS color_contrast_analyses (
    id              SERIAL PRIMARY KEY,
    audit_id        INTEGER REFERENCES site_audits(id) ON DELETE CASCADE,
    element_selector VARCHAR(500),
    foreground_color VARCHAR(20) NOT NULL,
    background_color VARCHAR(20) NOT NULL,
    contrast_ratio  NUMERIC(6,2) NOT NULL,
    required_ratio  NUMERIC(6,2) NOT NULL,
    passes_aa       BOOLEAN DEFAULT FALSE,
    passes_aaa      BOOLEAN DEFAULT FALSE,
    font_size       VARCHAR(20),
    is_bold         BOOLEAN DEFAULT FALSE,
    page_url        VARCHAR(500),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- SCREEN READER TESTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS screen_reader_tests (
    id              SERIAL PRIMARY KEY,
    audit_id        INTEGER REFERENCES site_audits(id) ON DELETE CASCADE,
    page_url        VARCHAR(500) NOT NULL,
    screen_reader   VARCHAR(50) NOT NULL,
    test_scenario   VARCHAR(255) NOT NULL,
    result          VARCHAR(50) NOT NULL,
    reading_order_correct BOOLEAN,
    all_content_accessible BOOLEAN,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- KEYBOARD NAVIGATION TESTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS keyboard_nav_tests (
    id              SERIAL PRIMARY KEY,
    audit_id        INTEGER REFERENCES site_audits(id) ON DELETE CASCADE,
    page_url        VARCHAR(500) NOT NULL,
    test_name       VARCHAR(255) NOT NULL,
    tab_order_logical BOOLEAN,
    focus_visible   BOOLEAN,
    no_keyboard_trap BOOLEAN,
    skip_links_present BOOLEAN,
    all_interactive_reachable BOOLEAN,
    result          VARCHAR(50) NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- ARIA VALIDATIONS
-- =========================================================================
CREATE TABLE IF NOT EXISTS aria_validations (
    id              SERIAL PRIMARY KEY,
    audit_id        INTEGER REFERENCES site_audits(id) ON DELETE CASCADE,
    element_selector VARCHAR(500),
    aria_attribute  VARCHAR(100) NOT NULL,
    expected_value  VARCHAR(255),
    actual_value    VARCHAR(255),
    is_valid        BOOLEAN DEFAULT FALSE,
    issue_description TEXT,
    page_url        VARCHAR(500),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- ALT TEXT GENERATIONS
-- =========================================================================
CREATE TABLE IF NOT EXISTS alt_text_generations (
    id              SERIAL PRIMARY KEY,
    audit_id        INTEGER REFERENCES site_audits(id) ON DELETE CASCADE,
    image_url       VARCHAR(500) NOT NULL,
    original_alt    TEXT,
    generated_alt   TEXT NOT NULL,
    ai_confidence   NUMERIC(5,2),
    is_decorative   BOOLEAN DEFAULT FALSE,
    is_approved     BOOLEAN DEFAULT FALSE,
    approved_by     INTEGER REFERENCES users(id),
    page_url        VARCHAR(500),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- ACCESSIBILITY SCORES
-- =========================================================================
CREATE TABLE IF NOT EXISTS accessibility_scores (
    id              SERIAL PRIMARY KEY,
    audit_id        INTEGER REFERENCES site_audits(id) ON DELETE CASCADE,
    category        VARCHAR(100) NOT NULL,
    score           NUMERIC(5,2) NOT NULL,
    max_score       NUMERIC(5,2) DEFAULT 100,
    weight          NUMERIC(3,2) DEFAULT 1.0,
    details         JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- COMPLIANCE CERTIFICATES
-- =========================================================================
CREATE TABLE IF NOT EXISTS compliance_certificates (
    id              SERIAL PRIMARY KEY,
    client_id       INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    audit_id        INTEGER REFERENCES site_audits(id) ON DELETE CASCADE,
    certificate_number VARCHAR(100) UNIQUE NOT NULL,
    compliance_standard VARCHAR(50) NOT NULL,
    level_achieved  VARCHAR(20) NOT NULL,
    issued_at       TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    is_valid        BOOLEAN DEFAULT TRUE,
    pdf_url         VARCHAR(500),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- AUDIT LOGS
-- =========================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(100),
    entity_id       INTEGER,
    details         JSONB,
    ip_address      VARCHAR(50),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- AI RESULTS (persisted AI call storage)
-- =========================================================================
CREATE TABLE IF NOT EXISTS ai_results (
    id              VARCHAR(36) PRIMARY KEY,
    entity_type     VARCHAR(100) NOT NULL,
    entity_id       VARCHAR(255),
    endpoint        VARCHAR(255) NOT NULL,
    result_json     JSONB,
    model           VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- COMPATIBILITY COLUMNS (align schema with route code)
-- =========================================================================

-- clients: add name, plan, status aliases
ALTER TABLE clients ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'basic';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(100);
UPDATE clients SET name = company_name WHERE name IS NULL;
UPDATE clients SET plan = subscription_tier WHERE plan = 'basic' AND subscription_tier IS NOT NULL;
UPDATE clients SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END WHERE status = 'active';

-- wcag_checks: add criterion, description, element_selector, recommendation aliases
ALTER TABLE wcag_checks ADD COLUMN IF NOT EXISTS criterion VARCHAR(50);
ALTER TABLE wcag_checks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE wcag_checks ADD COLUMN IF NOT EXISTS element_selector VARCHAR(500);
ALTER TABLE wcag_checks ADD COLUMN IF NOT EXISTS recommendation TEXT;
UPDATE wcag_checks SET criterion = criterion_id WHERE criterion IS NULL;

-- accessibility_issues: add type and status aliases
ALTER TABLE accessibility_issues ADD COLUMN IF NOT EXISTS type VARCHAR(100);
ALTER TABLE accessibility_issues ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'open';
UPDATE accessibility_issues SET type = issue_type WHERE type IS NULL;
UPDATE accessibility_issues SET status = CASE WHEN is_resolved THEN 'resolved' ELSE 'open' END WHERE status = 'open';

-- fix_suggestions: add confidence_score and ai_model aliases
ALTER TABLE fix_suggestions ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2);
ALTER TABLE fix_suggestions ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100);
UPDATE fix_suggestions SET confidence_score = ai_confidence WHERE confidence_score IS NULL;

-- ada_reports: add generated_by, findings (jsonb), recommendations (jsonb) columns
ALTER TABLE ada_reports ADD COLUMN IF NOT EXISTS generated_by VARCHAR(100);
ALTER TABLE ada_reports ADD COLUMN IF NOT EXISTS findings JSONB;
ALTER TABLE ada_reports ADD COLUMN IF NOT EXISTS recommendations JSONB;

-- color_contrast_analyses: add wcag_aa_pass and wcag_aaa_pass aliases
ALTER TABLE color_contrast_analyses ADD COLUMN IF NOT EXISTS wcag_aa_pass BOOLEAN DEFAULT FALSE;
ALTER TABLE color_contrast_analyses ADD COLUMN IF NOT EXISTS wcag_aaa_pass BOOLEAN DEFAULT FALSE;
UPDATE color_contrast_analyses SET wcag_aa_pass = passes_aa WHERE wcag_aa_pass = FALSE;
UPDATE color_contrast_analyses SET wcag_aaa_pass = passes_aaa WHERE wcag_aaa_pass = FALSE;

-- screen_reader_tests: add element_type, element_selector, expected_announcement, actual_result, status aliases
ALTER TABLE screen_reader_tests ADD COLUMN IF NOT EXISTS element_type VARCHAR(100);
ALTER TABLE screen_reader_tests ADD COLUMN IF NOT EXISTS element_selector VARCHAR(500);
ALTER TABLE screen_reader_tests ADD COLUMN IF NOT EXISTS expected_announcement TEXT;
ALTER TABLE screen_reader_tests ADD COLUMN IF NOT EXISTS actual_result TEXT;
ALTER TABLE screen_reader_tests ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- aria_validations: add recommendation, severity, current_value, expected_value aliases
ALTER TABLE aria_validations ADD COLUMN IF NOT EXISTS current_value VARCHAR(255);
ALTER TABLE aria_validations ADD COLUMN IF NOT EXISTS expected_value VARCHAR(255);
ALTER TABLE aria_validations ADD COLUMN IF NOT EXISTS recommendation TEXT;
ALTER TABLE aria_validations ADD COLUMN IF NOT EXISTS severity VARCHAR(50) DEFAULT 'major';

-- alt_text_generations: add current_alt, generated_alt, context_description, confidence_score, ai_model, status aliases
ALTER TABLE alt_text_generations ADD COLUMN IF NOT EXISTS current_alt TEXT;
ALTER TABLE alt_text_generations ADD COLUMN IF NOT EXISTS generated_alt TEXT;
ALTER TABLE alt_text_generations ADD COLUMN IF NOT EXISTS context_description TEXT;
ALTER TABLE alt_text_generations ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2);
ALTER TABLE alt_text_generations ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100);
ALTER TABLE alt_text_generations ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
UPDATE alt_text_generations SET current_alt = original_alt WHERE current_alt IS NULL;
UPDATE alt_text_generations SET generated_alt = alt_text_generations.generated_alt WHERE generated_alt IS NULL;

-- compliance_certificates: add certificate_type, compliance_level, valid_from, valid_until, issued_by
ALTER TABLE compliance_certificates ADD COLUMN IF NOT EXISTS certificate_type VARCHAR(100);
ALTER TABLE compliance_certificates ADD COLUMN IF NOT EXISTS compliance_level VARCHAR(20);
ALTER TABLE compliance_certificates ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE compliance_certificates ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
ALTER TABLE compliance_certificates ADD COLUMN IF NOT EXISTS issued_by VARCHAR(100);
UPDATE compliance_certificates SET compliance_level = level_achieved WHERE compliance_level IS NULL;
UPDATE compliance_certificates SET valid_until = expires_at WHERE valid_until IS NULL;

-- audit_logs: ensure varchar id and performed_by
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id_text VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS performed_by VARCHAR(255);

-- users: ensure uuid id column works (id is SERIAL, routes store uuid strings — add uuid_id alias)
ALTER TABLE users ADD COLUMN IF NOT EXISTS uuid_id VARCHAR(36) UNIQUE;

MIGRATIONS

success "All migrations applied"

# ---------------------------------------------------------------------------
# 4. Seed the database
# ---------------------------------------------------------------------------
header "4/6  Seeding database with demo data"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q <<'SEED'

-- ==========================================================================
-- DEMO USER  (demo@accessibility.com / password123)
-- Password hash = bcrypt of "password123"
-- ==========================================================================
INSERT INTO users (email, password_hash, full_name, role)
VALUES
  ('demo@accessibility.com', '$2b$10$8KzaNdKIMyOkASCakb/UWOVi6U2JXk0jVZOFkHr8rGLDqUz6h0GDW', 'Demo User', 'admin'),
  ('auditor1@accessibility.com', '$2b$10$8KzaNdKIMyOkASCakb/UWOVi6U2JXk0jVZOFkHr8rGLDqUz6h0GDW', 'Alice Chen', 'auditor'),
  ('auditor2@accessibility.com', '$2b$10$8KzaNdKIMyOkASCakb/UWOVi6U2JXk0jVZOFkHr8rGLDqUz6h0GDW', 'Bob Martinez', 'auditor'),
  ('viewer@accessibility.com', '$2b$10$8KzaNdKIMyOkASCakb/UWOVi6U2JXk0jVZOFkHr8rGLDqUz6h0GDW', 'Carol Davis', 'viewer')
ON CONFLICT (email) DO NOTHING;

-- ==========================================================================
-- CLIENTS (15+)
-- ==========================================================================
INSERT INTO clients (company_name, contact_name, contact_email, website_url, industry, subscription_tier, is_active)
VALUES
  ('TechCorp Inc.',         'James Wilson',     'james@techcorp.com',       'https://www.techcorp.com',       'Technology',     'enterprise', TRUE),
  ('HealthFirst Medical',   'Sarah Johnson',    'sarah@healthfirst.org',    'https://www.healthfirst.org',    'Healthcare',     'professional', TRUE),
  ('EduLearn Academy',      'Michael Brown',    'michael@edulearn.edu',     'https://www.edulearn.edu',       'Education',      'professional', TRUE),
  ('GreenBank Financial',   'Emily Davis',      'emily@greenbank.com',      'https://www.greenbank.com',      'Finance',        'enterprise', TRUE),
  ('RetailMax Stores',      'David Lee',        'david@retailmax.com',      'https://www.retailmax.com',      'Retail',         'basic', TRUE),
  ('GovServices Portal',    'Lisa Anderson',    'lisa@govservices.gov',     'https://www.govservices.gov',    'Government',     'enterprise', TRUE),
  ('MediaStream Co.',       'Robert Taylor',    'robert@mediastream.io',    'https://www.mediastream.io',     'Media',          'professional', TRUE),
  ('TravelEase Bookings',   'Jennifer White',   'jennifer@travelease.com',  'https://www.travelease.com',     'Travel',         'basic', TRUE),
  ('FoodDelight Delivery',  'Christopher Martin','chris@fooddelight.com',   'https://www.fooddelight.com',    'Food & Beverage','basic', TRUE),
  ('LegalPro Associates',   'Amanda Harris',    'amanda@legalpro.com',      'https://www.legalpro.com',       'Legal',          'professional', TRUE),
  ('RealEstate Hub',        'Daniel Clark',     'daniel@realestatehub.com', 'https://www.realestatehub.com',  'Real Estate',    'basic', TRUE),
  ('AutoDrive Motors',      'Michelle Lewis',   'michelle@autodrive.com',   'https://www.autodrive.com',      'Automotive',     'professional', TRUE),
  ('CloudNine Hosting',     'Kevin Robinson',   'kevin@cloudnine.io',       'https://www.cloudnine.io',       'Technology',     'enterprise', TRUE),
  ('FitLife Wellness',      'Rachel Walker',    'rachel@fitlife.com',       'https://www.fitlife.com',        'Health & Fitness','basic', TRUE),
  ('ArtGallery Online',     'Steven Young',     'steven@artgallery.com',    'https://www.artgallery.com',     'Arts',           'basic', TRUE),
  ('NonProfit United',      'Karen Allen',      'karen@nonprofitunited.org','https://www.nonprofitunited.org','Non-Profit',     'professional', TRUE)
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- SITE AUDITS (16)
-- ==========================================================================
INSERT INTO site_audits (client_id, url, audit_type, status, overall_score, pages_scanned, issues_found, started_at, completed_at)
VALUES
  (1, 'https://www.techcorp.com',          'full',       'completed', 87.50, 45, 12, NOW()-INTERVAL '30 days', NOW()-INTERVAL '29 days'),
  (1, 'https://app.techcorp.com',          'partial',    'completed', 72.30, 20,  8, NOW()-INTERVAL '15 days', NOW()-INTERVAL '14 days'),
  (2, 'https://www.healthfirst.org',       'full',       'completed', 91.00, 60,  5, NOW()-INTERVAL '25 days', NOW()-INTERVAL '24 days'),
  (3, 'https://www.edulearn.edu',          'full',       'completed', 65.80, 38, 22, NOW()-INTERVAL '20 days', NOW()-INTERVAL '19 days'),
  (4, 'https://www.greenbank.com',         'full',       'completed', 78.40, 55, 15, NOW()-INTERVAL '18 days', NOW()-INTERVAL '17 days'),
  (5, 'https://www.retailmax.com',         'quick',      'completed', 54.20, 15, 28, NOW()-INTERVAL '12 days', NOW()-INTERVAL '12 days'),
  (6, 'https://www.govservices.gov',       'full',       'completed', 95.60, 80,  3, NOW()-INTERVAL '10 days', NOW()-INTERVAL '9 days'),
  (7, 'https://www.mediastream.io',        'full',       'in_progress', NULL, 30, 0, NOW()-INTERVAL '2 days',  NULL),
  (8, 'https://www.travelease.com',        'full',       'completed', 69.90, 42, 18, NOW()-INTERVAL '22 days', NOW()-INTERVAL '21 days'),
  (9, 'https://www.fooddelight.com',       'quick',      'completed', 58.10, 12, 25, NOW()-INTERVAL '8 days',  NOW()-INTERVAL '8 days'),
  (10,'https://www.legalpro.com',          'full',       'completed', 82.70, 35, 10, NOW()-INTERVAL '14 days', NOW()-INTERVAL '13 days'),
  (11,'https://www.realestatehub.com',     'partial',    'completed', 61.30, 18, 20, NOW()-INTERVAL '6 days',  NOW()-INTERVAL '5 days'),
  (12,'https://www.autodrive.com',         'full',       'completed', 76.50, 50, 14, NOW()-INTERVAL '28 days', NOW()-INTERVAL '27 days'),
  (13,'https://www.cloudnine.io',          'full',       'completed', 93.20, 70,  4, NOW()-INTERVAL '5 days',  NOW()-INTERVAL '4 days'),
  (14,'https://www.fitlife.com',           'quick',      'pending',   NULL,   0,  0, NULL,                      NULL),
  (15,'https://www.artgallery.com',        'full',       'completed', 48.90, 25, 35, NOW()-INTERVAL '3 days',  NOW()-INTERVAL '2 days')
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- WCAG CHECKS (16)
-- ==========================================================================
INSERT INTO wcag_checks (audit_id, criterion_id, criterion_name, level, status, details, page_url)
VALUES
  (1, '1.1.1', 'Non-text Content',               'A',   'pass',   'All images have appropriate alt text.',            'https://www.techcorp.com/'),
  (1, '1.4.3', 'Contrast (Minimum)',              'AA',  'fail',   'Footer links have contrast ratio of 3.2:1.',      'https://www.techcorp.com/about'),
  (1, '2.1.1', 'Keyboard',                        'A',   'pass',   'All interactive elements are keyboard accessible.','https://www.techcorp.com/'),
  (3, '1.3.1', 'Info and Relationships',           'A',   'pass',   'Proper heading hierarchy throughout.',            'https://www.healthfirst.org/'),
  (3, '2.4.6', 'Headings and Labels',             'AA',  'pass',   'Descriptive headings on all sections.',           'https://www.healthfirst.org/services'),
  (4, '1.1.1', 'Non-text Content',               'A',   'fail',   '14 images missing alt text in course catalog.',   'https://www.edulearn.edu/courses'),
  (4, '4.1.2', 'Name, Role, Value',               'A',   'fail',   'Custom dropdown lacks ARIA role.',                'https://www.edulearn.edu/register'),
  (5, '1.4.11','Non-text Contrast',               'AA',  'fail',   'Form input borders below 3:1 ratio.',            'https://www.greenbank.com/login'),
  (6, '2.4.1', 'Bypass Blocks',                   'A',   'fail',   'No skip navigation link present.',                'https://www.retailmax.com/'),
  (7, '1.3.4', 'Orientation',                     'AA',  'pass',   'Content adapts to portrait and landscape.',       'https://www.govservices.gov/'),
  (7, '2.5.3', 'Label in Name',                   'A',   'pass',   'Visible labels match accessible names.',          'https://www.govservices.gov/forms'),
  (9, '3.1.1', 'Language of Page',                'A',   'fail',   'Missing lang attribute on html element.',         'https://www.travelease.com/'),
  (10,'2.4.7', 'Focus Visible',                   'AA',  'fail',   'Custom CSS removes outline on focus.',            'https://www.fooddelight.com/menu'),
  (11,'1.4.4', 'Resize Text',                     'AA',  'pass',   'Text scales to 200% without loss.',              'https://www.legalpro.com/'),
  (13,'3.3.2', 'Labels or Instructions',           'A',   'pass',   'All form fields have visible labels.',           'https://www.cloudnine.io/signup'),
  (16,'1.2.1', 'Audio-only and Video-only',        'A',   'fail',   'Gallery videos lack text alternatives.',          'https://www.artgallery.com/gallery')
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- ACCESSIBILITY ISSUES (18)
-- ==========================================================================
INSERT INTO accessibility_issues (audit_id, issue_type, severity, wcag_criterion, element_selector, description, page_url, is_resolved)
VALUES
  (1,  'color-contrast',   'moderate', '1.4.3',  'footer a',                     'Footer links have insufficient contrast ratio (3.2:1, needs 4.5:1).',         'https://www.techcorp.com/',         FALSE),
  (1,  'missing-alt',      'critical', '1.1.1',  'img.hero-banner',              'Hero banner image is missing alt text.',                                       'https://www.techcorp.com/',         TRUE),
  (2,  'keyboard-trap',    'critical', '2.1.2',  'div.modal-overlay',            'Modal dialog traps keyboard focus with no escape mechanism.',                  'https://app.techcorp.com/dashboard',FALSE),
  (4,  'missing-alt',      'critical', '1.1.1',  'img.course-thumbnail',         '14 course thumbnail images have empty alt attributes.',                        'https://www.edulearn.edu/courses',  FALSE),
  (4,  'missing-label',    'serious',  '4.1.2',  'select.course-filter',         'Course filter dropdown has no accessible name.',                               'https://www.edulearn.edu/courses',  FALSE),
  (4,  'heading-order',    'moderate', '1.3.1',  'h4.section-title',             'Heading jumps from h1 to h4 skipping h2 and h3.',                             'https://www.edulearn.edu/about',    FALSE),
  (5,  'form-contrast',    'serious',  '1.4.11', 'input.form-control',           'Form input borders have contrast ratio of 2.1:1.',                             'https://www.greenbank.com/login',   FALSE),
  (6,  'skip-link',        'serious',  '2.4.1',  'body',                         'No skip navigation link to bypass repeated header content.',                   'https://www.retailmax.com/',        FALSE),
  (6,  'missing-alt',      'critical', '1.1.1',  'img.product-image',            '23 product images missing meaningful alt text.',                               'https://www.retailmax.com/products',FALSE),
  (6,  'empty-link',       'serious',  '2.4.4',  'a.social-icon',               'Social media links contain no text or aria-label.',                            'https://www.retailmax.com/',        FALSE),
  (9,  'language',         'serious',  '3.1.1',  'html',                         'HTML element missing lang attribute.',                                         'https://www.travelease.com/',       FALSE),
  (9,  'auto-play',        'moderate', '1.4.2',  'video.hero-video',             'Background video auto-plays with audio and no pause control.',                 'https://www.travelease.com/',       FALSE),
  (10, 'focus-visible',    'serious',  '2.4.7',  '*:focus',                      'CSS rule outline:none removes visible focus indicator site-wide.',             'https://www.fooddelight.com/',      FALSE),
  (12, 'missing-alt',      'critical', '1.1.1',  'img.listing-photo',            '12 property listing images have no alt text.',                                 'https://www.realestatehub.com/',    FALSE),
  (13, 'color-contrast',   'minor',    '1.4.6',  'p.disclaimer',                 'Disclaimer text has low contrast (5.2:1) – fails AAA but passes AA.',         'https://www.autodrive.com/legal',   FALSE),
  (16, 'missing-alt',      'critical', '1.1.1',  'img.artwork',                  '30 artwork images use filename as alt text.',                                  'https://www.artgallery.com/gallery',FALSE),
  (16, 'video-captions',   'critical', '1.2.2',  'video.artist-interview',       'Artist interview videos have no captions.',                                    'https://www.artgallery.com/videos', FALSE),
  (16, 'focus-order',      'serious',  '2.4.3',  'div.lightbox',                 'Image lightbox has illogical tab order.',                                      'https://www.artgallery.com/gallery',FALSE)
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- FIX SUGGESTIONS (16)
-- ==========================================================================
INSERT INTO fix_suggestions (issue_id, suggestion_text, code_before, code_after, ai_confidence, is_applied)
VALUES
  (1,  'Increase footer link contrast by using a lighter text color.',           'color: #767676;', 'color: #595959;',  92.50, FALSE),
  (2,  'Add descriptive alt text to the hero banner image.',                     '<img class="hero-banner" src="banner.jpg">', '<img class="hero-banner" src="banner.jpg" alt="TechCorp digital transformation solutions">', 97.00, TRUE),
  (3,  'Add Escape key handler and focus return to modal component.',            'openModal() { this.modal.show(); }', 'openModal() { this.modal.show(); this.modal.addEventListener("keydown", e => { if(e.key==="Escape") this.closeModal(); }); }', 88.30, FALSE),
  (4,  'Generate meaningful alt text describing each course thumbnail.',         '<img class="course-thumbnail" alt="">', '<img class="course-thumbnail" alt="Introduction to Data Science course preview">', 91.00, FALSE),
  (5,  'Add aria-label to the course filter dropdown.',                          '<select class="course-filter">', '<select class="course-filter" aria-label="Filter courses by category">', 95.50, FALSE),
  (6,  'Restructure headings to follow sequential order.',                       '<h4 class="section-title">', '<h2 class="section-title">', 94.00, FALSE),
  (7,  'Increase input border contrast to meet 3:1 minimum ratio.',             'border: 1px solid #ccc;', 'border: 1px solid #767676;', 96.20, FALSE),
  (8,  'Add a skip navigation link as the first focusable element.',             '<body>', '<body><a href="#main-content" class="skip-link">Skip to main content</a>', 98.00, FALSE),
  (9,  'Add descriptive alt text to all product images.',                        '<img class="product-image" src="prod.jpg">', '<img class="product-image" src="prod.jpg" alt="Wireless Bluetooth headphones in matte black">', 89.70, FALSE),
  (10, 'Add accessible text to social media icon links.',                        '<a class="social-icon" href="#"><i class="fa-twitter"></i></a>', '<a class="social-icon" href="#" aria-label="Follow us on Twitter"><i class="fa-twitter"></i></a>', 96.80, FALSE),
  (11, 'Add lang attribute to the HTML element.',                                '<html>', '<html lang="en">', 99.00, FALSE),
  (12, 'Add pause/stop controls and remove autoplay audio.',                     '<video autoplay>', '<video autoplay muted controls>', 93.40, FALSE),
  (13, 'Remove outline:none and add custom focus styles.',                       '*:focus { outline: none; }', '*:focus { outline: 2px solid #005fcc; outline-offset: 2px; }', 97.50, FALSE),
  (14, 'Add descriptive alt text to all property listing photos.',               '<img class="listing-photo">', '<img class="listing-photo" alt="3-bedroom house exterior view at 123 Oak Street">', 90.10, FALSE),
  (15, 'Increase disclaimer text contrast or make font larger.',                 'color: #757575;', 'color: #5a5a5a;', 85.60, FALSE),
  (16, 'Replace filename alt text with descriptive artwork descriptions.',       '<img alt="IMG_4521.jpg">', '<img alt="Abstract oil painting with blue and gold geometric patterns by Maria Santos">', 88.90, FALSE)
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- ADA REPORTS (15)
-- ==========================================================================
INSERT INTO ada_reports (audit_id, client_id, report_type, title, summary, compliance_level, total_issues, critical_issues, generated_at)
VALUES
  (1,  1,  'full',      'TechCorp Q4 Accessibility Audit',             'Comprehensive audit of techcorp.com. 12 issues found with 2 critical.', 'AA',    12,  2,  NOW()-INTERVAL '29 days'),
  (2,  1,  'partial',   'TechCorp App Dashboard Review',               'Focused audit of the app dashboard. Modal accessibility issues noted.',  'A',      8,  1,  NOW()-INTERVAL '14 days'),
  (3,  2,  'full',      'HealthFirst Annual Compliance Report',        'Excellent compliance. Minor issues only.',                               'AA',     5,  0,  NOW()-INTERVAL '24 days'),
  (4,  3,  'full',      'EduLearn Accessibility Assessment',           'Significant issues in course catalog and registration flow.',            'none',  22,  4,  NOW()-INTERVAL '19 days'),
  (5,  4,  'full',      'GreenBank Digital Banking Audit',             'Form accessibility needs improvement. Login flow has contrast issues.',  'A',     15,  2,  NOW()-INTERVAL '17 days'),
  (6,  5,  'quick',     'RetailMax Quick Scan Report',                 'Numerous issues across product pages. Major alt text deficiencies.',     'none',  28,  8,  NOW()-INTERVAL '12 days'),
  (7,  6,  'full',      'GovServices Section 508 Compliance Report',   'Near-perfect compliance. Meets federal Section 508 requirements.',      'AAA',    3,  0,  NOW()-INTERVAL '9 days'),
  (9,  8,  'full',      'TravelEase Booking Platform Audit',           'Language and media issues detected. Auto-playing video problematic.',    'A',     18,  3,  NOW()-INTERVAL '21 days'),
  (10, 9,  'quick',     'FoodDelight Menu Accessibility Review',       'Focus management issues throughout. Keyboard users significantly impacted.','none',25,  5,  NOW()-INTERVAL '8 days'),
  (11,10,  'full',      'LegalPro Document Portal Audit',              'Good overall compliance. Minor focus visibility issues.',                'AA',    10,  1,  NOW()-INTERVAL '13 days'),
  (12,11,  'partial',   'RealEstate Hub Listings Page Review',         'Property images lack meaningful descriptions. Screen reader experience poor.','A', 20,  6,  NOW()-INTERVAL '5 days'),
  (13,12,  'full',      'AutoDrive Website Full Audit',                'Generally compliant with minor contrast issues in legal disclaimers.',   'AA',    14,  2,  NOW()-INTERVAL '27 days'),
  (14,13,  'full',      'CloudNine Platform Accessibility Report',     'Excellent accessibility. Strong ARIA implementation.',                   'AAA',    4,  0,  NOW()-INTERVAL '4 days'),
  (16,15,  'full',      'ArtGallery Accessibility Audit',              'Critical issues with image alt text and video captions.',                'none',  35, 12,  NOW()-INTERVAL '2 days'),
  (1,  1,  'summary',   'TechCorp Monthly Progress Summary',           'Follow-up review shows 2 of 12 original issues resolved.',              'AA',    10,  1,  NOW()-INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- COLOR CONTRAST ANALYSES (16)
-- ==========================================================================
INSERT INTO color_contrast_analyses (audit_id, element_selector, foreground_color, background_color, contrast_ratio, required_ratio, passes_aa, passes_aaa, font_size, is_bold, page_url)
VALUES
  (1,  'footer a',           '#767676', '#ffffff', 4.48,  4.50, FALSE, FALSE, '14px', FALSE, 'https://www.techcorp.com/'),
  (1,  'h1.hero-title',      '#ffffff', '#1a1a2e', 15.39, 3.00, TRUE,  TRUE,  '48px', TRUE,  'https://www.techcorp.com/'),
  (1,  'p.body-text',        '#333333', '#ffffff', 12.63, 4.50, TRUE,  TRUE,  '16px', FALSE, 'https://www.techcorp.com/about'),
  (3,  'a.nav-link',         '#004d99', '#ffffff', 7.28,  4.50, TRUE,  TRUE,  '16px', FALSE, 'https://www.healthfirst.org/'),
  (4,  'span.badge',         '#ffffff', '#ff6600', 3.14,  4.50, FALSE, FALSE, '12px', TRUE,  'https://www.edulearn.edu/courses'),
  (5,  'label.form-label',   '#555555', '#f5f5f5', 4.97,  4.50, TRUE,  FALSE, '14px', FALSE, 'https://www.greenbank.com/login'),
  (5,  'input.form-control', '#333333', '#ffffff', 12.63, 4.50, TRUE,  TRUE,  '16px', FALSE, 'https://www.greenbank.com/login'),
  (6,  'a.product-link',     '#0066cc', '#ffffff', 5.21,  4.50, TRUE,  FALSE, '14px', FALSE, 'https://www.retailmax.com/products'),
  (6,  'span.sale-price',    '#cc0000', '#ffffff', 5.89,  4.50, TRUE,  FALSE, '18px', TRUE,  'https://www.retailmax.com/products'),
  (7,  'a.gov-link',         '#003366', '#ffffff', 10.69, 4.50, TRUE,  TRUE,  '16px', FALSE, 'https://www.govservices.gov/'),
  (9,  'button.cta',         '#ffffff', '#e67300', 3.20,  4.50, FALSE, FALSE, '16px', TRUE,  'https://www.travelease.com/'),
  (10, 'p.menu-desc',        '#888888', '#ffffff', 3.54,  4.50, FALSE, FALSE, '13px', FALSE, 'https://www.fooddelight.com/menu'),
  (13, 'p.disclaimer',       '#757575', '#ffffff', 4.59,  7.00, FALSE, FALSE, '12px', FALSE, 'https://www.autodrive.com/legal'),
  (14, 'h2.section-title',   '#1a1a1a', '#ffffff', 17.15, 3.00, TRUE,  TRUE,  '28px', TRUE,  'https://www.cloudnine.io/'),
  (16, 'figcaption',         '#999999', '#ffffff', 2.85,  4.50, FALSE, FALSE, '14px', FALSE, 'https://www.artgallery.com/gallery'),
  (16, 'a.artist-name',      '#336699', '#f0f0f0', 3.98,  4.50, FALSE, FALSE, '16px', FALSE, 'https://www.artgallery.com/gallery')
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- SCREEN READER TESTS (16)
-- ==========================================================================
INSERT INTO screen_reader_tests (audit_id, page_url, screen_reader, test_scenario, result, reading_order_correct, all_content_accessible, notes)
VALUES
  (1,  'https://www.techcorp.com/',          'NVDA',       'Homepage navigation',                'pass',   TRUE,  TRUE,  'All navigation items announced correctly.'),
  (1,  'https://www.techcorp.com/about',     'VoiceOver',  'About page content reading',         'pass',   TRUE,  TRUE,  'Content flows logically with proper heading structure.'),
  (2,  'https://app.techcorp.com/dashboard', 'JAWS',       'Dashboard modal interaction',        'fail',   FALSE, FALSE, 'Modal content not announced. Focus not trapped in modal.'),
  (3,  'https://www.healthfirst.org/',       'VoiceOver',  'Service listings navigation',        'pass',   TRUE,  TRUE,  'Service cards read with appropriate context.'),
  (4,  'https://www.edulearn.edu/courses',   'NVDA',       'Course catalog browsing',            'fail',   TRUE,  FALSE, '14 images announced as "image" with no description.'),
  (4,  'https://www.edulearn.edu/register',  'JAWS',       'Registration form completion',       'fail',   TRUE,  FALSE, 'Course filter dropdown has no accessible name.'),
  (6,  'https://www.retailmax.com/',         'VoiceOver',  'Product grid exploration',           'fail',   FALSE, FALSE, 'Product images have no alt text. Social links empty.'),
  (7,  'https://www.govservices.gov/',       'NVDA',       'Full site screen reader audit',      'pass',   TRUE,  TRUE,  'Exemplary ARIA implementation throughout.'),
  (7,  'https://www.govservices.gov/forms',  'JAWS',       'Government form submission',         'pass',   TRUE,  TRUE,  'All form fields properly labeled. Error messages announced.'),
  (9,  'https://www.travelease.com/',        'VoiceOver',  'Homepage booking flow',              'fail',   TRUE,  FALSE, 'Auto-playing video disrupts screen reader. No page language.'),
  (10, 'https://www.fooddelight.com/menu',   'NVDA',       'Menu browsing and ordering',         'fail',   FALSE, FALSE, 'Menu categories not announced. No landmark regions.'),
  (11, 'https://www.legalpro.com/',          'JAWS',       'Document search and download',       'pass',   TRUE,  TRUE,  'Search results announced with document type and date.'),
  (12, 'https://www.realestatehub.com/',     'VoiceOver',  'Property listing browsing',          'fail',   TRUE,  FALSE, 'Property photos lack alt text. Map widget inaccessible.'),
  (14, 'https://www.cloudnine.io/',          'NVDA',       'Platform feature overview',          'pass',   TRUE,  TRUE,  'Feature comparison table fully accessible.'),
  (14, 'https://www.cloudnine.io/signup',    'JAWS',       'Account signup flow',                'pass',   TRUE,  TRUE,  'Multi-step form with clear progress indication.'),
  (16, 'https://www.artgallery.com/gallery', 'VoiceOver',  'Art gallery lightbox navigation',    'fail',   FALSE, FALSE, 'Images described only by filename. Lightbox traps focus.')
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- KEYBOARD NAVIGATION TESTS (16)
-- ==========================================================================
INSERT INTO keyboard_nav_tests (audit_id, page_url, test_name, tab_order_logical, focus_visible, no_keyboard_trap, skip_links_present, all_interactive_reachable, result, notes)
VALUES
  (1,  'https://www.techcorp.com/',          'Homepage tab navigation',         TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  'pass', 'Clean tab order with visible focus indicators.'),
  (1,  'https://www.techcorp.com/contact',   'Contact form keyboard access',    TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  'pass', 'Form fields and submit button all reachable.'),
  (2,  'https://app.techcorp.com/dashboard', 'Dashboard modal keyboard trap',   TRUE,  TRUE,  FALSE, FALSE, FALSE, 'fail', 'Modal creates keyboard trap. No escape mechanism.'),
  (3,  'https://www.healthfirst.org/',       'Patient portal keyboard nav',     TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  'pass', 'All interactive elements accessible via keyboard.'),
  (4,  'https://www.edulearn.edu/courses',   'Course filter keyboard access',   FALSE, TRUE,  TRUE,  FALSE, FALSE, 'fail', 'Custom dropdown not keyboard operable.'),
  (5,  'https://www.greenbank.com/login',    'Login form keyboard access',      TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  'pass', 'Login flow fully keyboard accessible.'),
  (6,  'https://www.retailmax.com/',         'Product page keyboard nav',       FALSE, FALSE, TRUE,  FALSE, FALSE, 'fail', 'No skip link. Product cards not fully reachable.'),
  (6,  'https://www.retailmax.com/cart',     'Shopping cart keyboard access',    TRUE,  FALSE, TRUE,  FALSE, TRUE,  'fail', 'Focus indicators removed by CSS.'),
  (7,  'https://www.govservices.gov/',       'Government portal full keyboard', TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  'pass', 'Perfect keyboard navigation throughout.'),
  (7,  'https://www.govservices.gov/forms',  'Form wizard keyboard test',       TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  'pass', 'Multi-step form navigable via keyboard.'),
  (9,  'https://www.travelease.com/',        'Booking flow keyboard test',      TRUE,  FALSE, TRUE,  FALSE, TRUE,  'fail', 'Date picker not keyboard accessible.'),
  (10, 'https://www.fooddelight.com/',       'Menu navigation keyboard test',   FALSE, FALSE, TRUE,  FALSE, FALSE, 'fail', 'Focus invisible. Menu items not all reachable.'),
  (12, 'https://www.realestatehub.com/',     'Property search keyboard test',   TRUE,  TRUE,  TRUE,  FALSE, FALSE, 'fail', 'Map widget captures focus. Filter not keyboard operable.'),
  (14, 'https://www.cloudnine.io/',          'Platform keyboard navigation',    TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  'pass', 'Excellent keyboard support with clear focus styles.'),
  (16, 'https://www.artgallery.com/gallery', 'Gallery lightbox keyboard test',  FALSE, FALSE, FALSE, FALSE, FALSE, 'fail', 'Lightbox traps keyboard. No focus management.'),
  (16, 'https://www.artgallery.com/',        'Homepage keyboard navigation',    TRUE,  TRUE,  TRUE,  FALSE, TRUE,  'fail', 'No skip navigation link to bypass header.')
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- ARIA VALIDATIONS (16)
-- ==========================================================================
INSERT INTO aria_validations (audit_id, element_selector, aria_attribute, expected_value, actual_value, is_valid, issue_description, page_url)
VALUES
  (1,  'nav.main-nav',        'aria-label',       'Main navigation',    'Main navigation',    TRUE,  NULL,                                                    'https://www.techcorp.com/'),
  (1,  'button.menu-toggle',  'aria-expanded',     'false',              'false',              TRUE,  NULL,                                                    'https://www.techcorp.com/'),
  (2,  'div.modal',           'aria-modal',        'true',               NULL,                 FALSE, 'Modal dialog missing aria-modal attribute.',            'https://app.techcorp.com/dashboard'),
  (2,  'div.modal',           'role',              'dialog',             NULL,                 FALSE, 'Modal missing dialog role.',                            'https://app.techcorp.com/dashboard'),
  (3,  'form.search',         'aria-label',        'Search health topics','Search health topics',TRUE, NULL,                                                   'https://www.healthfirst.org/'),
  (4,  'select.course-filter','aria-label',        'Filter by category', NULL,                 FALSE, 'Dropdown missing aria-label.',                          'https://www.edulearn.edu/courses'),
  (5,  'div.alert',           'role',              'alert',              'alert',              TRUE,  NULL,                                                    'https://www.greenbank.com/login'),
  (6,  'a.social-icon',       'aria-label',        'Visit Twitter page', NULL,                 FALSE, 'Social icon link has no accessible name.',              'https://www.retailmax.com/'),
  (7,  'main',                'role',              'main',               'main',               TRUE,  NULL,                                                    'https://www.govservices.gov/'),
  (7,  'nav.breadcrumb',      'aria-label',        'Breadcrumb',         'Breadcrumb',         TRUE,  NULL,                                                    'https://www.govservices.gov/services'),
  (9,  'div.carousel',        'aria-roledescription','carousel',         NULL,                 FALSE, 'Image carousel missing aria-roledescription.',          'https://www.travelease.com/'),
  (10, 'div.menu-section',    'role',              'region',             NULL,                 FALSE, 'Menu sections lack landmark roles.',                    'https://www.fooddelight.com/menu'),
  (13, 'table.comparison',    'aria-label',        'Feature comparison', 'Feature comparison', TRUE,  NULL,                                                    'https://www.autodrive.com/models'),
  (14, 'div.tabs',            'role',              'tablist',            'tablist',            TRUE,  NULL,                                                    'https://www.cloudnine.io/pricing'),
  (16, 'div.lightbox',        'aria-modal',        'true',               NULL,                 FALSE, 'Lightbox missing aria-modal attribute.',                'https://www.artgallery.com/gallery'),
  (16, 'button.close-lightbox','aria-label',       'Close lightbox',     NULL,                 FALSE, 'Close button has no accessible name.',                  'https://www.artgallery.com/gallery')
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- ALT TEXT GENERATIONS (16)
-- ==========================================================================
INSERT INTO alt_text_generations (audit_id, image_url, original_alt, generated_alt, ai_confidence, is_decorative, is_approved, page_url)
VALUES
  (1,  'https://www.techcorp.com/img/hero.jpg',         NULL,             'Diverse team collaborating around a digital whiteboard in modern office', 94.20, FALSE, TRUE,  'https://www.techcorp.com/'),
  (1,  'https://www.techcorp.com/img/divider.png',      NULL,             '',                                                                        97.00, TRUE,  TRUE,  'https://www.techcorp.com/about'),
  (4,  'https://www.edulearn.edu/img/course1.jpg',      '',               'Instructor explaining data visualization charts on a projector screen',   91.30, FALSE, FALSE, 'https://www.edulearn.edu/courses'),
  (4,  'https://www.edulearn.edu/img/course2.jpg',      '',               'Student writing Python code on a laptop in a classroom setting',           89.70, FALSE, FALSE, 'https://www.edulearn.edu/courses'),
  (4,  'https://www.edulearn.edu/img/course3.jpg',      '',               'Group of students collaborating on a robotics project',                   92.10, FALSE, FALSE, 'https://www.edulearn.edu/courses'),
  (6,  'https://www.retailmax.com/img/headphones.jpg',  NULL,             'Wireless Bluetooth over-ear headphones in matte black finish',            93.50, FALSE, FALSE, 'https://www.retailmax.com/products'),
  (6,  'https://www.retailmax.com/img/keyboard.jpg',    NULL,             'Mechanical gaming keyboard with RGB backlighting and wrist rest',         90.80, FALSE, FALSE, 'https://www.retailmax.com/products'),
  (6,  'https://www.retailmax.com/img/monitor.jpg',     NULL,             '27-inch curved ultrawide monitor displaying colorful landscape',          88.40, FALSE, FALSE, 'https://www.retailmax.com/products'),
  (9,  'https://www.travelease.com/img/beach.jpg',      'image',          'Sunset view of a tropical beach with palm trees and turquoise water',     95.60, FALSE, FALSE, 'https://www.travelease.com/'),
  (9,  'https://www.travelease.com/img/city.jpg',       'photo',          'Aerial view of Paris with the Eiffel Tower at golden hour',               93.20, FALSE, FALSE, 'https://www.travelease.com/destinations'),
  (12, 'https://www.realestatehub.com/img/house1.jpg',  NULL,             'Two-story colonial home with white siding and red front door',            91.90, FALSE, FALSE, 'https://www.realestatehub.com/'),
  (12, 'https://www.realestatehub.com/img/house2.jpg',  NULL,             'Modern downtown loft apartment with exposed brick and large windows',     90.30, FALSE, FALSE, 'https://www.realestatehub.com/'),
  (16, 'https://www.artgallery.com/img/art1.jpg',       'IMG_4521.jpg',   'Abstract oil painting with blue and gold geometric patterns',             88.90, FALSE, FALSE, 'https://www.artgallery.com/gallery'),
  (16, 'https://www.artgallery.com/img/art2.jpg',       'IMG_4522.jpg',   'Bronze sculpture of a dancer in mid-leap on a marble pedestal',           87.50, FALSE, FALSE, 'https://www.artgallery.com/gallery'),
  (16, 'https://www.artgallery.com/img/art3.jpg',       'IMG_4523.jpg',   'Watercolor landscape depicting a misty mountain valley at sunrise',      90.10, FALSE, FALSE, 'https://www.artgallery.com/gallery'),
  (16, 'https://www.artgallery.com/img/spacer.gif',     NULL,             '',                                                                        98.50, TRUE,  TRUE,  'https://www.artgallery.com/gallery')
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- ACCESSIBILITY SCORES (18)
-- ==========================================================================
INSERT INTO accessibility_scores (audit_id, category, score, max_score, weight, details)
VALUES
  (1,  'Perceivable',     85.00, 100, 1.0, '{"images_with_alt": 43, "images_total": 45, "contrast_issues": 1}'),
  (1,  'Operable',        92.00, 100, 1.0, '{"keyboard_accessible": true, "no_traps": true, "skip_links": true}'),
  (1,  'Understandable',  88.00, 100, 1.0, '{"lang_attribute": true, "error_messages": true, "consistent_nav": true}'),
  (1,  'Robust',          85.00, 100, 1.0, '{"valid_html": true, "aria_correct": true, "parsing_errors": 2}'),
  (3,  'Perceivable',     93.00, 100, 1.0, '{"images_with_alt": 60, "images_total": 60, "contrast_issues": 0}'),
  (3,  'Operable',        95.00, 100, 1.0, '{"keyboard_accessible": true, "no_traps": true, "skip_links": true}'),
  (3,  'Understandable',  90.00, 100, 1.0, '{"lang_attribute": true, "error_messages": true, "consistent_nav": true}'),
  (3,  'Robust',          86.00, 100, 1.0, '{"valid_html": true, "aria_correct": true, "parsing_errors": 1}'),
  (4,  'Perceivable',     52.00, 100, 1.0, '{"images_with_alt": 24, "images_total": 38, "contrast_issues": 3}'),
  (4,  'Operable',        70.00, 100, 1.0, '{"keyboard_accessible": false, "no_traps": true, "skip_links": false}'),
  (4,  'Understandable',  72.00, 100, 1.0, '{"lang_attribute": true, "error_messages": false, "consistent_nav": true}'),
  (4,  'Robust',          69.00, 100, 1.0, '{"valid_html": false, "aria_correct": false, "parsing_errors": 8}'),
  (7,  'Perceivable',     98.00, 100, 1.0, '{"images_with_alt": 80, "images_total": 80, "contrast_issues": 0}'),
  (7,  'Operable',        97.00, 100, 1.0, '{"keyboard_accessible": true, "no_traps": true, "skip_links": true}'),
  (7,  'Understandable',  94.00, 100, 1.0, '{"lang_attribute": true, "error_messages": true, "consistent_nav": true}'),
  (7,  'Robust',          93.00, 100, 1.0, '{"valid_html": true, "aria_correct": true, "parsing_errors": 0}'),
  (14, 'Perceivable',     95.00, 100, 1.0, '{"images_with_alt": 68, "images_total": 70, "contrast_issues": 0}'),
  (14, 'Operable',        94.00, 100, 1.0, '{"keyboard_accessible": true, "no_traps": true, "skip_links": true}')
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- COMPLIANCE CERTIFICATES (15)
-- ==========================================================================
INSERT INTO compliance_certificates (client_id, audit_id, certificate_number, compliance_standard, level_achieved, issued_at, expires_at, is_valid)
VALUES
  (1,  1,  'CERT-2025-TC-001',   'WCAG 2.1',       'AA',   NOW()-INTERVAL '29 days', NOW()+INTERVAL '336 days', TRUE),
  (1,  2,  'CERT-2025-TC-002',   'WCAG 2.1',       'A',    NOW()-INTERVAL '14 days', NOW()+INTERVAL '351 days', TRUE),
  (2,  3,  'CERT-2025-HF-001',   'WCAG 2.1',       'AA',   NOW()-INTERVAL '24 days', NOW()+INTERVAL '341 days', TRUE),
  (2,  3,  'CERT-2025-HF-002',   'Section 508',    'Full', NOW()-INTERVAL '24 days', NOW()+INTERVAL '341 days', TRUE),
  (4,  5,  'CERT-2025-GB-001',   'WCAG 2.1',       'A',    NOW()-INTERVAL '17 days', NOW()+INTERVAL '348 days', TRUE),
  (6,  7,  'CERT-2025-GS-001',   'WCAG 2.1',       'AAA',  NOW()-INTERVAL '9 days',  NOW()+INTERVAL '356 days', TRUE),
  (6,  7,  'CERT-2025-GS-002',   'Section 508',    'Full', NOW()-INTERVAL '9 days',  NOW()+INTERVAL '356 days', TRUE),
  (6,  7,  'CERT-2025-GS-003',   'ADA Title III',  'Full', NOW()-INTERVAL '9 days',  NOW()+INTERVAL '356 days', TRUE),
  (10, 11, 'CERT-2025-LP-001',   'WCAG 2.1',       'AA',   NOW()-INTERVAL '13 days', NOW()+INTERVAL '352 days', TRUE),
  (12, 13, 'CERT-2025-AD-001',   'WCAG 2.1',       'AA',   NOW()-INTERVAL '27 days', NOW()+INTERVAL '338 days', TRUE),
  (13, 14, 'CERT-2025-CN-001',   'WCAG 2.1',       'AAA',  NOW()-INTERVAL '4 days',  NOW()+INTERVAL '361 days', TRUE),
  (13, 14, 'CERT-2025-CN-002',   'Section 508',    'Full', NOW()-INTERVAL '4 days',  NOW()+INTERVAL '361 days', TRUE),
  (8,  9,  'CERT-2025-TE-001',   'WCAG 2.1',       'A',    NOW()-INTERVAL '21 days', NOW()+INTERVAL '344 days', TRUE),
  (1,  1,  'CERT-2024-TC-LEGACY','WCAG 2.0',       'AA',   NOW()-INTERVAL '400 days',NOW()-INTERVAL '35 days',  FALSE),
  (14, 15, 'CERT-2025-FL-001',   'WCAG 2.1',       'A',    NOW()-INTERVAL '60 days', NOW()+INTERVAL '305 days', TRUE)
ON CONFLICT DO NOTHING;

-- ==========================================================================
-- AUDIT LOGS (20)
-- ==========================================================================
INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, created_at)
VALUES
  (1, 'login',              'user',                   1,  '{"method": "email"}',                          '192.168.1.10',  NOW()-INTERVAL '30 days'),
  (1, 'create_audit',       'site_audit',             1,  '{"url": "https://www.techcorp.com"}',          '192.168.1.10',  NOW()-INTERVAL '30 days'),
  (1, 'complete_audit',     'site_audit',             1,  '{"score": 87.5, "issues": 12}',                '192.168.1.10',  NOW()-INTERVAL '29 days'),
  (1, 'generate_report',    'ada_report',             1,  '{"type": "full"}',                             '192.168.1.10',  NOW()-INTERVAL '29 days'),
  (1, 'issue_certificate',  'compliance_certificate', 1,  '{"standard": "WCAG 2.1", "level": "AA"}',     '192.168.1.10',  NOW()-INTERVAL '29 days'),
  (2, 'login',              'user',                   2,  '{"method": "email"}',                          '10.0.0.25',     NOW()-INTERVAL '25 days'),
  (2, 'create_audit',       'site_audit',             3,  '{"url": "https://www.healthfirst.org"}',       '10.0.0.25',     NOW()-INTERVAL '25 days'),
  (2, 'complete_audit',     'site_audit',             3,  '{"score": 91.0, "issues": 5}',                 '10.0.0.25',     NOW()-INTERVAL '24 days'),
  (2, 'generate_report',    'ada_report',             3,  '{"type": "full"}',                             '10.0.0.25',     NOW()-INTERVAL '24 days'),
  (1, 'create_audit',       'site_audit',             4,  '{"url": "https://www.edulearn.edu"}',          '192.168.1.10',  NOW()-INTERVAL '20 days'),
  (1, 'resolve_issue',      'accessibility_issue',    2,  '{"applied_fix": true}',                        '192.168.1.10',  NOW()-INTERVAL '18 days'),
  (3, 'login',              'user',                   3,  '{"method": "email"}',                          '172.16.0.5',    NOW()-INTERVAL '15 days'),
  (3, 'create_audit',       'site_audit',             2,  '{"url": "https://app.techcorp.com"}',          '172.16.0.5',    NOW()-INTERVAL '15 days'),
  (1, 'create_client',      'client',                 16, '{"company": "NonProfit United"}',              '192.168.1.10',  NOW()-INTERVAL '12 days'),
  (2, 'create_audit',       'site_audit',             7,  '{"url": "https://www.govservices.gov"}',       '10.0.0.25',     NOW()-INTERVAL '10 days'),
  (2, 'issue_certificate',  'compliance_certificate', 6,  '{"standard": "WCAG 2.1", "level": "AAA"}',    '10.0.0.25',     NOW()-INTERVAL '9 days'),
  (1, 'login',              'user',                   1,  '{"method": "email"}',                          '192.168.1.10',  NOW()-INTERVAL '5 days'),
  (1, 'generate_report',    'ada_report',             15, '{"type": "summary"}',                          '192.168.1.10',  NOW()-INTERVAL '5 days'),
  (1, 'create_audit',       'site_audit',             16, '{"url": "https://www.artgallery.com"}',        '192.168.1.10',  NOW()-INTERVAL '3 days'),
  (1, 'complete_audit',     'site_audit',             16, '{"score": 48.9, "issues": 35}',                '192.168.1.10',  NOW()-INTERVAL '2 days')
ON CONFLICT DO NOTHING;

SEED

success "Seeded all tables with demo data"

# ---------------------------------------------------------------------------
# 5. Install npm dependencies
# ---------------------------------------------------------------------------
header "5/6  Installing npm dependencies"

if [[ -f "$PROJECT_ROOT/backend/package.json" ]]; then
  info "Installing backend dependencies..."
  (cd "$PROJECT_ROOT/backend" && npm install --silent 2>&1) | tail -1
  success "Backend dependencies installed"
else
  warn "backend/package.json not found – skipping backend npm install"
fi

if [[ -f "$PROJECT_ROOT/frontend/package.json" ]]; then
  info "Installing frontend dependencies..."
  (cd "$PROJECT_ROOT/frontend" && npm install --silent 2>&1) | tail -1
  success "Frontend dependencies installed"
else
  warn "frontend/package.json not found – skipping frontend npm install"
fi

# ---------------------------------------------------------------------------
# 6. Start servers
# ---------------------------------------------------------------------------
header "6/6  Starting servers"

# --- Backend ---
if [[ -f "$PROJECT_ROOT/backend/package.json" ]]; then
  info "Starting backend on port $BACKEND_PORT..."
  if command -v npx &>/dev/null; then
    (cd "$PROJECT_ROOT/backend" && npx nodemon server.js 2>&1 | while IFS= read -r line; do echo -e "${BLUE}[backend]${NC}  $line"; done) &
    BACKEND_PID=$!
    success "Backend started (PID $BACKEND_PID)"
  else
    (cd "$PROJECT_ROOT/backend" && node server.js 2>&1 | while IFS= read -r line; do echo -e "${BLUE}[backend]${NC}  $line"; done) &
    BACKEND_PID=$!
    success "Backend started without nodemon (PID $BACKEND_PID)"
  fi
else
  warn "Cannot start backend – backend/package.json not found"
fi

# --- Frontend ---
if [[ -f "$PROJECT_ROOT/frontend/package.json" ]]; then
  info "Starting frontend on port $FRONTEND_PORT..."
  (cd "$PROJECT_ROOT/frontend" && PORT=$FRONTEND_PORT npm start 2>&1 | while IFS= read -r line; do echo -e "${GREEN}[frontend]${NC} $line"; done) &
  FRONTEND_PID=$!
  success "Frontend started (PID $FRONTEND_PID)"
else
  warn "Cannot start frontend – frontend/package.json not found"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${GREEN}=============================================${NC}"
echo -e "${BOLD}${GREEN}  AI Accessibility Audit Agent is running!   ${NC}"
echo -e "${BOLD}${GREEN}=============================================${NC}"
echo ""
echo -e "  ${CYAN}Frontend${NC}  → ${BOLD}http://localhost:${FRONTEND_PORT}${NC}"
echo -e "  ${CYAN}Backend${NC}   → ${BOLD}http://localhost:${BACKEND_PORT}${NC}"
echo -e "  ${CYAN}Database${NC}  → ${BOLD}${DB_NAME}@${DB_HOST}:${DB_PORT}${NC}"
echo ""
echo -e "  ${YELLOW}Demo login:${NC}  demo@accessibility.com / password123"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop all servers."
echo ""

# Wait for background processes
wait
