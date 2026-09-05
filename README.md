# Financial Data Quality Validator

A zero-dependency rule-based financial data validation engine and compliance audit dashboard. Enforces ISO standards, security checksums, entity identifier integrity, and trade lifecycle business logic across JSON and CSV feeds.

## Core Validation Checks

1. **ISO 6166 ISIN Checksum**: Modulo 10 double-add-double algorithm validating international security identifiers.
2. **ISO 4217 Currency Validation**: Dictionary verification for valid 3-letter currency codes.
3. **ISO 17442 Legal Entity Identifier (LEI)**: 20-character alphanumeric structural validation.
4. **Business Logic & Market Rules**:
   - Non-negative price and quantity constraints.
   - Standard execution side rules (`BUY`, `SELL`, `SELL_SHORT`).
   - Duplicate trade identifier detection.
   - Settlement date consistency (no retroactive trade settlement anomalies).

## Architecture

```
financial-data-quality-validator/
├── index.js              # Validation engine, CLI reporting & server
├── index.html            # Dark-theme browser audit dashboard
├── sample-trades.json    # Sample JSON trades dataset with edge cases
├── sample-trades.csv     # Sample CSV trades dataset
├── package.json          # Package manifest
└── README.md             # Documentation
```

## Setup & Quick Start

Requires Node.js 16+ or modern browser. No external npm packages required.

### CLI Mode

Audit JSON trade feeds:
```bash
node index.js sample-trades.json
```

Audit CSV trade feeds:
```bash
node index.js sample-trades.csv
```

### Web Dashboard Mode

Launch the live interactive web dashboard:
```bash
node index.js --web 3000
```
Open `http://localhost:3000` or double-click `index.html` in your browser.

## License

MIT
