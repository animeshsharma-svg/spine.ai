export const intakeData = {
  title: 'intake_req_july6',
  requestType: 'Purchase Intake',
  category: 'Development Tools',
  vendor: 'Github Copilot',
  quantity: '99',
  priority: 'High',
  expenseType: 'One-time purchase',
  expenseFrequency: 'One-time',
  budget: '1000',
  remarks: 'approved.',
};

export const lineItems = [
  { row: 1, product: 'Business Laptop 14inch i7(ITC', date: '13', quantity: '100', location: 'b', locationOption: 'Mumbai Dispatch Hub(100004)', price: '100', expectedExpense: '₹ 10,000' },
  { row: 2, product: '9V Vol Battery', date: '13', quantity: '50', location: 'm', locationOption: 'Mumbai Programme Office(', price: '50', expectedExpense: '₹ 2,500' },
  { row: 3, product: 'Academic Textbook(EDU-LIB-001)', date: '13', quantity: '10', location: 'b', locationOption: 'Mumbai Dispatch Hub(100004)', price: '120', expectedExpense: '₹ 1,200' },
];

export const poLineItems = [
  { rowName: 'Select Business Laptop 14inch', price: '100' },
  { rowName: 'Select 9v Vol Battery 50.0 50 Unit ₹', price: '50' },
  { rowName: 'Select Academic Textbook 10.0', price: '120', isLastRow: true },
];

export const invoiceLineItems = [
  { rowName: 'Select 100.0 100.0 Unit ₹ 0', price: '100' },
  { rowName: 'Select 50.0 50.0 Unit ₹', price: '50' },
  { rowName: 'Select 10.0 10.0 Unit ₹ 0', price: '120', isLastRow: true },
];

export const grnQuantities = ['100', '50', '10'];

/**
 * ONE line item, with every editable value filled.
 *
 * Three items made the run long without proving anything the first one does
 * not: the 3-way match is about a document agreeing with itself across PO,
 * invoice, GRN and bill, and one line proves that as well as three. What was
 * NOT being proved was the line itself — MRP and discount were skipped over
 * by the tabbing, so a PO went through with half its columns untouched.
 */
export const directPOLineItems = [
  {
    product: '9V Vol Battery',
    qty: '50',
    mrp: '60',
    unitPrice: '50',
  },
];
