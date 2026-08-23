# Copy-Paste Prompt: Student Monthly Tuition Fee Concession

Implement a student-specific recurring tuition fee concession system in this MERN school management application.

## Stack

- MongoDB + Mongoose
- Express.js + Node.js
- React.js

## Existing Fee Behavior

- A class session stores the annual tuition fee in `ClassSession.fees.tuition`.
- The annual tuition fee is split into 12 monthly tuition installments from April to March.
- Student-specific fee decisions are stored in `Student.feeSettings`.
- Fee records store annual totals, fee breakdowns, monthly installments, payment history, and family-ledger allocations.

## Required Behavior

During student admission or student editing, allow an admin to assign a recurring tuition concession:

- No Concession
- Fixed Monthly Amount
- Percentage
- Concession Value
- Optional Reason
- Active/Inactive status

Example:

- Annual class tuition: Rs. 6,000
- Original monthly tuition: Rs. 500
- Fixed monthly concession: Rs. 50
- Final monthly tuition payable: Rs. 450
- Final annual tuition payable: Rs. 5,400

## Data Model

Add this under both `Student.feeSettings` and the fee record's `feeSettings` snapshot:

```js
tuitionConcession: {
  type: {
    type: String,
    enum: ["none", "fixed", "percentage"],
    default: "none"
  },
  value: {
    type: Number,
    default: 0,
    min: 0
  },
  reason: {
    type: String,
    default: "",
    trim: true
  },
  isActive: {
    type: Boolean,
    default: false
  }
}
```

Each tuition installment must snapshot:

```js
{
  feeType: "tuition",
  monthKey: "APRIL",
  originalAmount: 500,
  concessionType: "fixed",
  concessionValue: 50,
  concessionAmount: 50,
  concessionReason: "Financial support",
  amount: 450,
  paidAmount: 0,
  dueAmount: 450
}
```

## Calculation Rules

- A fixed concession is a monthly amount, not an annual amount.
- A percentage concession is calculated separately for each monthly tuition installment.
- Inactive or `none` concessions must charge full tuition.
- Fixed concession cannot exceed the monthly tuition amount.
- Percentage concession cannot exceed 100%.
- Negative values are invalid.
- Final tuition cannot be below zero.
- Use paise-safe rounding.

## Historical Snapshot Rule

Never dynamically recalculate old or paid installments from the student's current concession.

When an admin edits a concession:

- Past-due installments keep their saved original amount and concession snapshot.
- Paid or partially paid installments keep their saved snapshot.
- Only future unpaid installments may use the updated concession.
- Fee collection, student statements, family statements, reports, and receipts must use the stored final installment `amount`.

## Backend Requirements

1. Update the Student and Fees Mongoose schemas.
2. Normalize and validate concession input in create/update student APIs.
3. Update fee calculation helpers so annual fee totals equal the sum of actual installment amounts.
4. Store original tuition, concession amount, and final tuition in fee breakdowns.
5. Snapshot concession details into every tuition installment.
6. Preserve historical installment snapshots on concession edits.
7. Ensure student and family fee ledgers use stored installment amounts instead of recalculating from class tuition.
8. Ensure payment allocation and outstanding balances use final discounted amounts.
9. Add tests for fixed concession, percentage concession, zero-floor validation, and historical snapshot preservation.

## Frontend Requirements

1. Add a `Fee Concession` section to student admission and edit forms.
2. Show fields for type, value, reason, and active status.
3. Disable value/reason/status when type is `none`.
4. Validate percentage and fixed limits.
5. Add a concession summary card to the student profile showing:
   - Original monthly tuition
   - Concession type and value
   - Monthly payable tuition
   - Reason
   - Status
6. In monthly fee views, show original tuition, concession deduction, and final payable tuition.

## Acceptance Criteria

- A class with annual tuition Rs. 6,000 produces Rs. 500 monthly installments.
- A student with a Rs. 50 fixed monthly concession produces Rs. 450 tuition installments.
- A student with a 10% concession also produces Rs. 450 tuition installments.
- Collection and outstanding totals use Rs. 450, not Rs. 500.
- Editing the concession does not change past-due, paid, or partially paid installment snapshots.
- Future unpaid installments use the updated active concession.
- Disabling the concession makes future unpaid installments charge full tuition.
- Backend tests pass and the React production build succeeds.
