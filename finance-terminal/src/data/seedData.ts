import type { Transaction } from '../types';

/**
 * Generates 18 months of realistic synthetic transaction data
 * mirroring Monarch Money's CSV export format.
 */

const ACCOUNTS = [
  { name: 'Chase Checking', number: '****4521', institution: 'Chase' },
  { name: 'Chase Savings', number: '****8834', institution: 'Chase' },
  { name: 'Amex Gold', number: '****3901', institution: 'American Express' },
  { name: 'Citi Double Cash', number: '****7712', institution: 'Citibank' },
];

// Merchants with their typical categories and average amounts
const MERCHANTS: { name: string; category: string; avgAmount: number; stddev: number; account?: string }[] = [
  // Housing
  { name: 'Wells Fargo Mortgage', category: 'Housing', avgAmount: 2850, stddev: 0, account: 'Chase Checking' },
  { name: 'Chase HELOC', category: 'Housing', avgAmount: 420, stddev: 30, account: 'Chase Checking' },
  { name: 'HOA Fees', category: 'Housing', avgAmount: 180, stddev: 0, account: 'Chase Checking' },
  // Income
  { name: 'Employer Direct Deposit', category: 'Income', avgAmount: 4800, stddev: 50, account: 'Chase Checking' },
  { name: 'Freelance Payment', category: 'Income', avgAmount: 1200, stddev: 400, account: 'Chase Checking' },
  // Groceries
  { name: 'Costco', category: 'Groceries', avgAmount: 187, stddev: 60 },
  { name: 'Whole Foods Market', category: 'Groceries', avgAmount: 95, stddev: 35 },
  { name: 'Trader Joe\'s', category: 'Groceries', avgAmount: 68, stddev: 22 },
  { name: 'HEB', category: 'Groceries', avgAmount: 112, stddev: 40 },
  // Dining
  { name: 'Chick-fil-A', category: 'Dining Out', avgAmount: 24, stddev: 8 },
  { name: 'Chipotle', category: 'Dining Out', avgAmount: 31, stddev: 9 },
  { name: 'Starbucks', category: 'Dining Out', avgAmount: 12, stddev: 4 },
  { name: 'Local Bistro', category: 'Dining Out', avgAmount: 78, stddev: 30 },
  { name: 'DoorDash', category: 'Dining Out', avgAmount: 45, stddev: 18 },
  { name: 'Uber Eats', category: 'Dining Out', avgAmount: 42, stddev: 15 },
  // Auto & Transport
  { name: 'Toyota Financial Services', category: 'Auto & Transport', avgAmount: 478, stddev: 0, account: 'Chase Checking' },
  { name: 'Shell Gas Station', category: 'Auto & Transport', avgAmount: 72, stddev: 20 },
  { name: 'Chevron', category: 'Auto & Transport', avgAmount: 65, stddev: 18 },
  { name: 'Uber', category: 'Auto & Transport', avgAmount: 22, stddev: 10 },
  // Shopping
  { name: 'Amazon', category: 'Shopping', avgAmount: 65, stddev: 80 },
  { name: 'Target', category: 'Shopping', avgAmount: 88, stddev: 45 },
  { name: 'Best Buy', category: 'Shopping', avgAmount: 145, stddev: 120 },
  { name: 'Nordstrom', category: 'Shopping', avgAmount: 180, stddev: 110 },
  // Health & Fitness
  { name: 'Planet Fitness', category: 'Health & Fitness', avgAmount: 24.99, stddev: 0 },
  { name: 'CVS Pharmacy', category: 'Health & Fitness', avgAmount: 42, stddev: 22 },
  { name: 'Walgreens', category: 'Health & Fitness', avgAmount: 38, stddev: 18 },
  // Entertainment
  { name: 'AMC Theaters', category: 'Entertainment', avgAmount: 38, stddev: 12 },
  { name: 'Steam', category: 'Entertainment', avgAmount: 25, stddev: 20 },
  { name: 'Apple iTunes', category: 'Entertainment', avgAmount: 15, stddev: 8 },
  // Subscriptions
  { name: 'Netflix', category: 'Subscriptions', avgAmount: 22.99, stddev: 0 },
  { name: 'Spotify', category: 'Subscriptions', avgAmount: 10.99, stddev: 0 },
  { name: 'Amazon Prime', category: 'Subscriptions', avgAmount: 14.99, stddev: 0 },
  { name: 'Apple One', category: 'Subscriptions', avgAmount: 32.95, stddev: 0 },
  { name: 'Hulu', category: 'Subscriptions', avgAmount: 17.99, stddev: 0 },
  { name: 'YouTube Premium', category: 'Subscriptions', avgAmount: 13.99, stddev: 0 },
  { name: 'Adobe Creative Cloud', category: 'Subscriptions', avgAmount: 54.99, stddev: 0 },
  { name: 'Microsoft 365', category: 'Subscriptions', avgAmount: 9.99, stddev: 0 },
  // Utilities
  { name: 'AT&T Wireless', category: 'Utilities', avgAmount: 165, stddev: 10 },
  { name: 'Comcast Xfinity', category: 'Utilities', avgAmount: 89, stddev: 5 },
  { name: 'Austin Energy', category: 'Utilities', avgAmount: 145, stddev: 60 },
  { name: 'City Water & Sewer', category: 'Utilities', avgAmount: 55, stddev: 15 },
  // Kids
  { name: 'Little League Registration', category: 'Kids Activities', avgAmount: 85, stddev: 20 },
  { name: 'Soccer Club', category: 'Kids Activities', avgAmount: 120, stddev: 30 },
  { name: 'Piano Lessons', category: 'Kids Activities', avgAmount: 160, stddev: 20 },
  // Personal Care
  { name: 'Great Clips', category: 'Personal Care', avgAmount: 25, stddev: 5 },
  { name: 'Ulta Beauty', category: 'Personal Care', avgAmount: 55, stddev: 35 },
  // Gifts
  { name: 'Amazon Gifts', category: 'Gifts & Donations', avgAmount: 75, stddev: 50 },
  { name: 'St. Jude Donation', category: 'Gifts & Donations', avgAmount: 50, stddev: 0 },
];

function randNormal(mean: number, sd: number): number {
  // Box-Muller
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0.01, mean + sd * z);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Seasonal multiplier for spending: higher in Nov-Dec, lower in Feb */
function seasonalMultiplier(month: number): number {
  const seasonal: Record<number, number> = {
    0: 0.85,  // Jan - post-holiday
    1: 0.80,  // Feb - low spend
    2: 0.90,
    3: 0.95,
    4: 1.00,
    5: 1.10,  // Summer travel
    6: 1.15,
    7: 1.10,
    8: 0.95,  // Back to school
    9: 1.00,
    10: 1.25, // Holiday shopping
    11: 1.45, // December
  };
  return seasonal[month] ?? 1.0;
}

export function generateSeedData(): Transaction[] {
  const transactions: Transaction[] = [];
  const endDate = new Date();
  endDate.setDate(1); // start of current month
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 18);

  let currentDate = new Date(startDate);

  while (currentDate < endDate) {
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const seasonal = seasonalMultiplier(month);

    // ---- INCOME: biweekly paychecks on 1st and 15th ----
    for (const payDay of [1, 15]) {
      const payDate = new Date(year, month, payDay);
      transactions.push({
        date: payDate,
        account: 'Chase Checking',
        accountNumber: '****4521',
        institution: 'Chase',
        merchant: 'Employer Direct Deposit',
        category: 'Income',
        tag: '',
        note: 'Biweekly paycheck',
        amount: randNormal(4800, 50), // positive = inflow
        originalStatement: 'ACH DEPOSIT EMPLOYER PAYROLL',
      });
    }

    // Occasional freelance income (60% chance per month)
    if (Math.random() < 0.6) {
      transactions.push({
        date: new Date(year, month, randInt(5, 25)),
        account: 'Chase Checking',
        accountNumber: '****4521',
        institution: 'Chase',
        merchant: 'Freelance Payment',
        category: 'Income',
        tag: '',
        note: '',
        amount: randNormal(1200, 400),
        originalStatement: 'WIRE TRANSFER CLIENT PAYMENT',
      });
    }

    // ---- FIXED MONTHLY EXPENSES ----
    // Mortgage on 1st
    transactions.push({
      date: new Date(year, month, 1),
      account: 'Chase Checking',
      accountNumber: '****4521',
      institution: 'Chase',
      merchant: 'Wells Fargo Mortgage',
      category: 'Housing',
      tag: '',
      note: '',
      amount: -2850,
      originalStatement: 'WELLS FARGO MORTGAGE PAYMENT',
    });

    // HELOC on 5th
    transactions.push({
      date: new Date(year, month, 5),
      account: 'Chase Checking',
      accountNumber: '****4521',
      institution: 'Chase',
      merchant: 'Chase HELOC',
      category: 'Housing',
      tag: '',
      note: '',
      amount: -randNormal(420, 30),
      originalStatement: 'HELOC PAYMENT',
    });

    // Auto loan on 10th
    transactions.push({
      date: new Date(year, month, 10),
      account: 'Chase Checking',
      accountNumber: '****4521',
      institution: 'Chase',
      merchant: 'Toyota Financial Services',
      category: 'Auto & Transport',
      tag: '',
      note: '',
      amount: -478,
      originalStatement: 'TOYOTA FINANCIAL AUTO LOAN',
    });

    // HOA on 1st
    transactions.push({
      date: new Date(year, month, 1),
      account: 'Chase Checking',
      accountNumber: '****4521',
      institution: 'Chase',
      merchant: 'HOA Fees',
      category: 'Housing',
      tag: '',
      note: '',
      amount: -180,
      originalStatement: 'HOA MONTHLY ASSESSMENT',
    });

    // Subscriptions (all monthly)
    const subs = [
      { merchant: 'Netflix', amount: 22.99, day: 3 },
      { merchant: 'Spotify', amount: 10.99, day: 7 },
      { merchant: 'Amazon Prime', amount: 14.99, day: 12 },
      { merchant: 'Apple One', amount: 32.95, day: 14 },
      { merchant: 'Hulu', amount: 17.99, day: 18 },
      { merchant: 'YouTube Premium', amount: 13.99, day: 20 },
      { merchant: 'Adobe Creative Cloud', amount: 54.99, day: 22 },
      { merchant: 'Microsoft 365', amount: 9.99, day: 25 },
    ];

    for (const sub of subs) {
      const acct = ACCOUNTS[Math.floor(Math.random() < 0.6 ? 2 : 3)];
      transactions.push({
        date: new Date(year, month, sub.day),
        account: acct.name,
        accountNumber: acct.number,
        institution: acct.institution,
        merchant: sub.merchant,
        category: 'Subscriptions',
        tag: '',
        note: '',
        amount: -sub.amount,
        originalStatement: `${sub.merchant.toUpperCase()} SUBSCRIPTION`,
      });
    }

    // Utilities
    for (const util of ['AT&T Wireless', 'Comcast Xfinity', 'Austin Energy', 'City Water & Sewer']) {
      const m = MERCHANTS.find(x => x.name === util)!;
      transactions.push({
        date: new Date(year, month, randInt(8, 20)),
        account: 'Chase Checking',
        accountNumber: '****4521',
        institution: 'Chase',
        merchant: util,
        category: 'Utilities',
        tag: '',
        note: '',
        // Energy spikes in summer (cooling) and winter (heating)
        amount: -(util === 'Austin Energy'
          ? randNormal(m.avgAmount * seasonal * (month >= 5 && month <= 8 ? 1.3 : 1), m.stddev)
          : randNormal(m.avgAmount, m.stddev)),
        originalStatement: `${util.toUpperCase()} BILL PAYMENT`,
      });
    }

    // ---- VARIABLE SPENDING ----
    // Groceries: 4–8 trips/month
    const groceryMerchants = ['Costco', 'Whole Foods Market', 'Trader Joe\'s', 'HEB'];
    const groceryTrips = randInt(4, 8);
    for (let i = 0; i < groceryTrips; i++) {
      const m = MERCHANTS.find(x => x.name === groceryMerchants[i % groceryMerchants.length])!;
      const acct = ACCOUNTS[Math.floor(Math.random() < 0.5 ? 2 : 1)];
      transactions.push({
        date: new Date(year, month, randInt(1, daysInMonth)),
        account: acct.name,
        accountNumber: acct.number,
        institution: acct.institution,
        merchant: m.name,
        category: 'Groceries',
        tag: '',
        note: '',
        amount: -randNormal(m.avgAmount * seasonal, m.stddev),
        originalStatement: `${m.name.toUpperCase()} PURCHASE`,
      });
    }

    // Dining: 6–15 times/month, seasonal
    const diningMerchants = ['Chick-fil-A', 'Chipotle', 'Starbucks', 'Local Bistro', 'DoorDash', 'Uber Eats'];
    const diningCount = Math.round(randInt(6, 15) * seasonal);
    for (let i = 0; i < diningCount; i++) {
      const mName = diningMerchants[randInt(0, diningMerchants.length - 1)];
      const m = MERCHANTS.find(x => x.name === mName)!;
      const acct = ACCOUNTS[Math.floor(Math.random() < 0.7 ? 2 : 3)];
      transactions.push({
        date: new Date(year, month, randInt(1, daysInMonth)),
        account: acct.name,
        accountNumber: acct.number,
        institution: acct.institution,
        merchant: mName,
        category: 'Dining Out',
        tag: '',
        note: '',
        amount: -randNormal(m.avgAmount * seasonal, m.stddev),
        originalStatement: `${mName.toUpperCase()} PURCHASE`,
      });
    }

    // Gas: 3–5 times/month
    const gasMerchants = ['Shell Gas Station', 'Chevron'];
    const gasFills = randInt(3, 5);
    for (let i = 0; i < gasFills; i++) {
      const mName = gasMerchants[i % 2];
      const m = MERCHANTS.find(x => x.name === mName)!;
      transactions.push({
        date: new Date(year, month, randInt(1, daysInMonth)),
        account: ACCOUNTS[Math.floor(Math.random() < 0.5 ? 0 : 2)].name,
        accountNumber: ACCOUNTS[0].number,
        institution: 'Chase',
        merchant: mName,
        category: 'Auto & Transport',
        tag: '',
        note: '',
        amount: -randNormal(m.avgAmount, m.stddev),
        originalStatement: `${mName.toUpperCase()} FUEL`,
      });
    }

    // Shopping: Amazon + seasonal extras
    const shopCount = Math.round(randInt(3, 8) * seasonal);
    const shopMerchants = ['Amazon', 'Target', 'Best Buy', 'Nordstrom'];
    for (let i = 0; i < shopCount; i++) {
      const mName = shopMerchants[randInt(0, shopMerchants.length - 1)];
      const m = MERCHANTS.find(x => x.name === mName)!;
      const acct = ACCOUNTS[Math.floor(Math.random() < 0.6 ? 2 : 3)];
      transactions.push({
        date: new Date(year, month, randInt(1, daysInMonth)),
        account: acct.name,
        accountNumber: acct.number,
        institution: acct.institution,
        merchant: mName,
        category: 'Shopping',
        tag: '',
        note: '',
        amount: -randNormal(m.avgAmount * seasonal, m.stddev),
        originalStatement: `${mName.toUpperCase()} PURCHASE`,
      });
    }

    // Health & Fitness: gym monthly + pharmacy as needed
    transactions.push({
      date: new Date(year, month, randInt(1, 5)),
      account: ACCOUNTS[3].name,
      accountNumber: ACCOUNTS[3].number,
      institution: 'Citibank',
      merchant: 'Planet Fitness',
      category: 'Health & Fitness',
      tag: '',
      note: '',
      amount: -24.99,
      originalStatement: 'PLANET FITNESS MONTHLY',
    });

    if (Math.random() < 0.7) {
      const pharma = Math.random() < 0.5 ? 'CVS Pharmacy' : 'Walgreens';
      const m = MERCHANTS.find(x => x.name === pharma)!;
      transactions.push({
        date: new Date(year, month, randInt(1, daysInMonth)),
        account: ACCOUNTS[2].name,
        accountNumber: ACCOUNTS[2].number,
        institution: 'American Express',
        merchant: pharma,
        category: 'Health & Fitness',
        tag: '',
        note: '',
        amount: -randNormal(m.avgAmount, m.stddev),
        originalStatement: `${pharma.toUpperCase()} PURCHASE`,
      });
    }

    // Entertainment: occasional movies, games
    if (Math.random() < 0.5) {
      transactions.push({
        date: new Date(year, month, randInt(1, daysInMonth)),
        account: ACCOUNTS[2].name,
        accountNumber: ACCOUNTS[2].number,
        institution: 'American Express',
        merchant: 'AMC Theaters',
        category: 'Entertainment',
        tag: '',
        note: '',
        amount: -randNormal(38, 12),
        originalStatement: 'AMC THEATERS PURCHASE',
      });
    }

    // Kids activities: school year (Aug-May)
    if (month < 6 || month >= 8) {
      for (const kids of ['Piano Lessons', 'Soccer Club']) {
        const m = MERCHANTS.find(x => x.name === kids)!;
        transactions.push({
          date: new Date(year, month, randInt(1, 10)),
          account: 'Chase Checking',
          accountNumber: '****4521',
          institution: 'Chase',
          merchant: kids,
          category: 'Kids Activities',
          tag: '',
          note: '',
          amount: -randNormal(m.avgAmount, m.stddev),
          originalStatement: `${kids.toUpperCase()} PAYMENT`,
        });
      }
    }

    // Personal care: 1–2x/month
    if (Math.random() < 0.8) {
      transactions.push({
        date: new Date(year, month, randInt(5, 25)),
        account: ACCOUNTS[2].name,
        accountNumber: ACCOUNTS[2].number,
        institution: 'American Express',
        merchant: 'Great Clips',
        category: 'Personal Care',
        tag: '',
        note: '',
        amount: -randNormal(25, 5),
        originalStatement: 'GREAT CLIPS PURCHASE',
      });
    }

    // Gifts & Donations: higher in Nov-Dec
    if (month === 10 || month === 11 || Math.random() < 0.3) {
      const giftAmt = (month === 10 || month === 11) ? randNormal(200, 100) : randNormal(75, 50);
      transactions.push({
        date: new Date(year, month, randInt(1, daysInMonth)),
        account: ACCOUNTS[2].name,
        accountNumber: ACCOUNTS[2].number,
        institution: 'American Express',
        merchant: month === 10 || month === 11 ? 'Amazon Gifts' : 'St. Jude Donation',
        category: 'Gifts & Donations',
        tag: '',
        note: '',
        amount: -giftAmt,
        originalStatement: 'PURCHASE',
      });
    }

    // Travel: summer (Jun-Aug) and holiday (Nov-Dec)
    if ((month >= 5 && month <= 7) || month === 11) {
      const travelAmt = month === 11 ? randNormal(800, 300) : randNormal(500, 200);
      transactions.push({
        date: new Date(year, month, randInt(1, daysInMonth)),
        account: ACCOUNTS[2].name,
        accountNumber: ACCOUNTS[2].number,
        institution: 'American Express',
        merchant: month === 11 ? 'United Airlines' : 'Southwest Airlines',
        category: 'Travel',
        tag: '',
        note: '',
        amount: -travelAmt,
        originalStatement: 'AIRLINE PURCHASE',
      });

      if (Math.random() < 0.7) {
        transactions.push({
          date: new Date(year, month, randInt(1, daysInMonth)),
          account: ACCOUNTS[2].name,
          accountNumber: ACCOUNTS[2].number,
          institution: 'American Express',
          merchant: 'Marriott Hotels',
          category: 'Travel',
          tag: '',
          note: '',
          amount: -randNormal(350, 150),
          originalStatement: 'MARRIOTT HOTEL STAY',
        });
      }
    }

    // Advance to next month
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  // Sort by date descending (most recent first)
  return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
}
