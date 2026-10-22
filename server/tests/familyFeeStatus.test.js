import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateStandaloneInstallmentPaidAmount,
  resolveMonthlyLedgerStatus,
} from "../services/familyFeeService.js";

test("carried unpaid balances are not marked paid", () => {
  assert.equal(
    resolveMonthlyLedgerStatus({
      endingBalancePaise: 845000,
      totalDuePaise: 845000,
      dueDate: "2026-04-30",
      asOfDate: "2026-06-09",
    }),
    "overdue"
  );
});

test("unpaid balances remain pending before the due date", () => {
  assert.equal(
    resolveMonthlyLedgerStatus({
      endingBalancePaise: 845000,
      totalDuePaise: 845000,
      dueDate: "2026-06-30",
      asOfDate: "2026-06-09",
    }),
    "pending"
  );
});

test("a month is paid only when its balance is cleared", () => {
  assert.equal(
    resolveMonthlyLedgerStatus({
      endingBalancePaise: 0,
      totalDuePaise: 845000,
      dueDate: "2026-04-30",
      asOfDate: "2026-06-09",
    }),
    "paid"
  );
});

test("persisted family allocations are removed before the family ledger is replayed", () => {
  assert.equal(
    calculateStandaloneInstallmentPaidAmount({
      feeType: "tuition",
      installment: {
        feeType: "tuition",
        installmentKey: "APRIL",
        paidAmount: 680,
      },
      paymentHistory: [
        {
          entryType: "family_payment",
          amount: 680,
          installments: [
            {
              feeType: "tuition",
              installmentKey: "APRIL",
              paidAmount: 680,
            },
          ],
        },
      ],
    }),
    0
  );
});

test("standalone installment money remains after family allocations are removed", () => {
  assert.equal(
    calculateStandaloneInstallmentPaidAmount({
      feeType: "tuition",
      installment: {
        feeType: "tuition",
        monthKey: "JUNE",
        paidAmount: 680,
      },
      paymentHistory: [
        {
          entryType: "payment",
          amount: 200,
          installments: [
            {
              feeType: "tuition",
              monthKey: "JUNE",
              paidAmount: 200,
            },
          ],
        },
        {
          entryType: "family_payment",
          amount: 480,
          installments: [
            {
              feeType: "tuition",
              monthKey: "JUNE",
              paidAmount: 480,
            },
          ],
        },
      ],
    }),
    200
  );
});
