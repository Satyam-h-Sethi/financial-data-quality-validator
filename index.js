#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');

const ISO_CURRENCIES = new Set([
  'USD','EUR','GBP','JPY','CAD','CHF','AUD','HKD','SGD','INR','CNY','NZD','SEK','NOK','KRW','MXN','BRL','ZAR'
]);

function isValidISIN(isin) {
  if (!isin || typeof isin !== 'string' || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
  let digits = '';
  for (let i = 0; i < 11; i++) {
    const c = isin[i];
    if (c >= 'A' && c <= 'Z') {
      digits += (c.charCodeAt(0) - 55).toString();
    } else {
      digits += c;
    }
  }
  let sum = 0;
  let dpos = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (dpos % 2 === 0) {
      n *= 2;
      if (n > 9) n = Math.floor(n / 10) + (n % 10);
    }
    sum += n;
    dpos++;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(isin[11], 10);
}

function isValidLEI(lei) {
  if (!lei || typeof lei !== 'string') return false;
  return /^[0-9A-Z]{20}$/.test(lei);
}

function parseInputFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (filePath.endsWith('.json') || content.startsWith('[') || content.startsWith('{')) {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [parsed];
  } else {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ''; });
      return row;
    });
  }
}

function validateDataset(records) {
  const idCounts = {};
  records.forEach(r => {
    if (r.trade_id) idCounts[r.trade_id] = (idCounts[r.trade_id] || 0) + 1;
  });

  return records.map(rec => {
    const issues = [];

    if (!rec.trade_id) {
      issues.push({ severity: 'CRITICAL', code: 'MISSING_ID', msg: 'Missing mandatory trade_id' });
    } else if (idCounts[rec.trade_id] > 1) {
      issues.push({ severity: 'WARNING', code: 'DUPLICATE_ID', msg: `Duplicate trade_id '${rec.trade_id}'` });
    }

    if (!rec.isin) {
      issues.push({ severity: 'CRITICAL', code: 'MISSING_ISIN', msg: 'Missing ISIN identifier' });
    } else if (!isValidISIN(rec.isin)) {
      issues.push({ severity: 'CRITICAL', code: 'INVALID_ISIN_CHECKSUM', msg: `ISIN '${rec.isin}' failed ISO 6166 checksum` });
    }

    if (!rec.currency) {
      issues.push({ severity: 'ERROR', code: 'MISSING_CURRENCY', msg: 'Missing currency' });
    } else if (!ISO_CURRENCIES.has(rec.currency.toUpperCase())) {
      issues.push({ severity: 'ERROR', code: 'INVALID_ISO4217_CURRENCY', msg: `Currency '${rec.currency}' not in ISO 4217` });
    }

    const price = parseFloat(rec.price);
    if (isNaN(price) || price <= 0) {
      issues.push({ severity: 'ERROR', code: 'INVALID_PRICE', msg: `Trade price (${rec.price}) must be positive` });
    }

    const qty = parseFloat(rec.quantity);
    if (isNaN(qty) || qty <= 0) {
      issues.push({ severity: 'ERROR', code: 'INVALID_QUANTITY', msg: `Quantity (${rec.quantity}) must be positive` });
    }

    const side = (rec.side || '').toUpperCase();
    if (!['BUY', 'SELL', 'SELL_SHORT'].includes(side)) {
      issues.push({ severity: 'ERROR', code: 'INVALID_SIDE', msg: `Invalid side '${rec.side}' (must be BUY/SELL)` });
    }

    if (!rec.counterparty_lei) {
      issues.push({ severity: 'WARNING', code: 'MISSING_LEI', msg: 'Missing counterparty LEI' });
    } else if (!isValidLEI(rec.counterparty_lei)) {
      issues.push({ severity: 'ERROR', code: 'INVALID_LEI_FORMAT', msg: `LEI '${rec.counterparty_lei}' must be 20 alphanumeric chars` });
    }

    const txDate = new Date(rec.timestamp);
    if (isNaN(txDate.getTime())) {
      issues.push({ severity: 'ERROR', code: 'INVALID_TIMESTAMP', msg: `Invalid ISO 8601 timestamp '${rec.timestamp}'` });
    }

    if (rec.settlement_date) {
      const settleDate = new Date(rec.settlement_date);
      if (isNaN(settleDate.getTime())) {
        issues.push({ severity: 'ERROR', code: 'INVALID_SETTLEMENT_DATE', msg: 'Invalid settlement date format' });
      } else if (!isNaN(txDate.getTime()) && settleDate < txDate) {
        issues.push({ severity: 'WARNING', code: 'RETROACTIVE_SETTLEMENT', msg: 'Settlement date is prior to trade timestamp' });
      }
    }

    let overallStatus = 'PASS';
    if (issues.some(i => i.severity === 'CRITICAL')) overallStatus = 'CRITICAL';
    else if (issues.some(i => i.severity === 'ERROR')) overallStatus = 'ERROR';
    else if (issues.some(i => i.severity === 'WARNING')) overallStatus = 'WARNING';

    return { record: rec, issues, status: overallStatus };
  });
}

function startWebServer(port = 3000) {
  const htmlPath = path.join(__dirname, 'index.html');
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      fs.readFile(htmlPath, (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error loading dashboard');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    console.log(`\n🚀 Financial Data Validator Dashboard running at http://localhost:${port}`);
    console.log('Press Ctrl+C to stop.\n');
  });
}

function runCli() {
  const args = process.argv.slice(2);

  if (args.includes('--web') || args.includes('-w')) {
    const portIdx = args.indexOf('--web') !== -1 ? args.indexOf('--web') + 1 : args.indexOf('-w') + 1;
    const port = parseInt(args[portIdx], 10) || 3000;
    startWebServer(port);
    return;
  }

  let targetFile = path.join(__dirname, 'sample-trades.json');
  const fileArg = args.find(a => !a.startsWith('-'));
  if (fileArg) targetFile = fileArg;

  if (!fs.existsSync(targetFile)) {
    console.log('Usage: node index.js [path/to/data.json|data.csv] [--web <port>]');
    process.exit(1);
  }

  const records = parseInputFile(targetFile);
  const validated = validateDataset(records);

  console.log('\n======================================================');
  console.log('      FINANCIAL DATA QUALITY VALIDATION AUDIT         ');
  console.log('======================================================\n');
  console.log(`Audited File     : ${path.basename(targetFile)}`);
  console.log(`Total Records    : ${records.length}\n`);

  console.table(validated.map(v => ({
    Status: v.status,
    TradeId: v.record.trade_id || 'N/A',
    ISIN: v.record.isin || 'N/A',
    Currency: v.record.currency || 'N/A',
    Violations: v.issues.map(i => `[${i.severity}] ${i.msg}`).join(' | ') || 'None (Valid)'
  })));

  const pass = validated.filter(v => v.status === 'PASS').length;
  const critical = validated.filter(v => v.status === 'CRITICAL').length;
  const error = validated.filter(v => v.status === 'ERROR').length;
  const warning = validated.filter(v => v.status === 'WARNING').length;

  console.log('------------------------------------------------------');
  console.log(`Summary: ${pass} Clean | ${critical} Critical | ${error} Error | ${warning} Warning`);
  console.log(`Data Quality Score: ${Math.round((pass / records.length) * 100)}%`);
  console.log('------------------------------------------------------\n');
  console.log('Tip: Run with `node index.js --web` to open interactive browser dashboard.\n');
}

if (require.main === module) {
  runCli();
}

module.exports = { validateDataset, isValidISIN, isValidLEI, parseInputFile };
