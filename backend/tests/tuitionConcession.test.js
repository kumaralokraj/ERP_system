import test from "node:test";
import assert from "node:assert/strict";

import { buildFeeInstallments } from "../utils/feeInstallmentEngine.js";
import {
  calculateTuitionConcessionSummary,
  calculateTuitionInstallmentAmounts,
} from "../utils/tuitionConcession.js";

test("fixed concession is deducted from every monthly tuition installment", () => {
  const installments = calculateTuitionInstallmentAmounts({
    annualTuition: 6000,
    concession: { type: "fixed", value: 50, isActive: true },
  });

  assert.equal(installments.length, 12);
  assert.ok(
    installments.every(
      (installment) =>
        installment.originalAmount === 500 &&
        installment.concessionAmount === 50 &&
        installment.amount === 450
    )
  );
  assert.deepEqual(
    calculateTuitionConcessionSummary(6000, { type: "fixed", value: 50, isActive: true }),
    {
      originalTuition: 6000,
      concessionAmount: 600,
      finalTuition: 5400,
    }
  );
});

test("percentage concession is calculated per monthly installment", () => {
  const installments = calculateTuitionInstallmentAmounts({
    annualTuition: 6000,
    concession: { type: "percentage", value: 10, isActive: true },
  });

  assert.ok(
    installments.every(
      (installment) =>
        installment.originalAmount === 500 &&
        installment.concessionAmount === 50 &&
        installment.amount === 450
    )
  );
});

test("concession never makes a tuition installment negative", () => {
  const [installment] = calculateTuitionInstallmentAmounts({
    annualTuition: 1200,
    concession: { type: "fixed", value: 500, isActive: true },
  });

  assert.equal(installment.originalAmount, 100);
  assert.equal(installment.concessionAmount, 100);
  assert.equal(installment.amount, 0);
});

test("inactive concession charges the full monthly tuition", () => {
  const [installment] = calculateTuitionInstallmentAmounts({
    annualTuition: 6000,
    concession: { type: "fixed", value: 50, isActive: false },
  });

  assert.equal(installment.originalAmount, 500);
  assert.equal(installment.concessionType, "none");
  assert.equal(installment.concessionAmount, 0);
  assert.equal(installment.amount, 500);
});

test("past and paid tuition snapshots survive a later concession edit", () => {
  const originalInstallments = buildFeeInstallments({
    academicYear: "2026-27",
    feeBreakdown: { originalTuition: 6000, tuition: 5400 },
    tuitionConcession: {
      type: "fixed",
      value: 50,
      reason: "Financial support",
      isActive: true,
    },
    asOfDate: new Date("2026-04-01T00:00:00.000Z"),
  });
  originalInstallments.find((installment) => installment.monthKey === "JULY").paidAmount = 100;

  const updatedInstallments = buildFeeInstallments({
    academicYear: "2026-27",
    feeBreakdown: { originalTuition: 6000, tuition: 4800 },
    tuitionConcession: {
      type: "fixed",
      value: 100,
      reason: "Updated support",
      isActive: true,
    },
    existingInstallments: originalInstallments,
    asOfDate: new Date("2026-06-11T00:00:00.000Z"),
  });

  const byMonth = new Map(updatedInstallments.map((installment) => [installment.monthKey, installment]));

  assert.equal(byMonth.get("APRIL").amount, 450);
  assert.equal(byMonth.get("MAY").amount, 450);
  assert.equal(byMonth.get("JUNE").amount, 400);
  assert.equal(byMonth.get("JULY").amount, 450);
  assert.equal(byMonth.get("AUGUST").amount, 400);
  assert.equal(byMonth.get("APRIL").concessionValue, 50);
  assert.equal(byMonth.get("JUNE").concessionValue, 100);
});
