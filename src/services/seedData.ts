import { db, generateId, resetDatabaseAll } from './db';
import { calculateAmount } from './formatters';

export async function hasExistingData(): Promise<boolean> {
  const count = await db.providers.count();
  return count > 0;
}

export async function populateDemoData(): Promise<boolean> {
  console.log('Loading realistic demo dairy data...');
  await resetDatabaseAll();

  const providersData = [
    { name: 'Ramesh Patil (रमेश पाटील)', phone: '9822012345', default_rate: 52.00, initial_rate: 50.00, rate_changed_date: '2026-08-15' },
    { name: 'Suresh Deshmukh (सुरेश देशमुख)', phone: '9822023456', default_rate: 54.00, initial_rate: 54.00 },
    { name: 'Mahesh Shinde (महेश शिंदे)', phone: '9822034567', default_rate: 50.00, initial_rate: 50.00 },
    { name: 'Anand Jagtap (आनंद जगताप)', phone: '9822045678', default_rate: 52.50, initial_rate: 52.50 },
    { name: 'Sunita Jadhav (सुनिता जाधव)', phone: '9822056789', default_rate: 53.00, initial_rate: 53.00 },
    { name: 'Babasaheb Bhosale (बाबासाहेब भोसले)', phone: '9822067890', default_rate: 51.00, initial_rate: 51.00 },
    { name: 'Prakash More (प्रकाश मोरे)', phone: '9822078901', default_rate: 55.00, initial_rate: 55.00 },
    { name: 'Ganesh Kadam (गणेश कदम)', phone: '9822089012', default_rate: 50.00, initial_rate: 50.00 },
  ];

  const createdProviders: { id: string; name: string; default_rate: number }[] = [];

  for (const p of providersData) {
    const providerId = generateId();
    createdProviders.push({ id: providerId, name: p.name, default_rate: p.default_rate });

    await db.providers.add({
      id: providerId,
      name: p.name,
      phone: p.phone,
      active: true,
      default_rate: p.default_rate,
      created_at: '2026-08-01T06:00:00.000Z',
      updated_at: '2026-08-01T06:00:00.000Z'
    });

    if (p.rate_changed_date) {
      await db.provider_rates.add({
        id: generateId(),
        provider_id: providerId,
        rate_per_litre: p.initial_rate,
        effective_from: '2026-08-01',
        effective_to: '2026-08-14',
        created_at: '2026-08-01T06:00:00.000Z'
      });
      await db.provider_rates.add({
        id: generateId(),
        provider_id: providerId,
        rate_per_litre: p.default_rate,
        effective_from: p.rate_changed_date,
        effective_to: null,
        created_at: '2026-08-15T06:00:00.000Z'
      });
    } else {
      await db.provider_rates.add({
        id: generateId(),
        provider_id: providerId,
        rate_per_litre: p.default_rate,
        effective_from: '2026-08-01',
        effective_to: null,
        created_at: '2026-08-01T06:00:00.000Z'
      });
    }
  }

  // Generate milk records from 1 Aug 2026 to 30 Aug 2026
  for (let day = 1; day <= 30; day++) {
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    const businessDate = `2026-08-${dayStr}`;

    let morningTotal = 0;
    let eveningTotal = 0;
    let morningAmount = 0;
    let eveningAmount = 0;

    for (let i = 0; i < createdProviders.length; i++) {
      const p = createdProviders[i];
      const baseMorning = 6 + (i % 5) * 1.5 + (day % 3) * 0.5;
      const baseEvening = 5.5 + (i % 4) * 1.2 + (day % 2) * 0.5;

      let rate = p.default_rate;
      if (p.name.startsWith('Ramesh Patil') && day < 15) {
        rate = 50.00;
      }

      const mQty = parseFloat(baseMorning.toFixed(1));
      const mAmount = calculateAmount(mQty, rate);
      await db.milk_collections.add({
        id: generateId(),
        provider_id: p.id,
        business_date: businessDate,
        session: 'MORNING',
        quantity_litres: mQty,
        rate_per_litre: rate,
        amount: mAmount,
        created_at: `${businessDate}T07:30:00.000Z`,
        updated_at: `${businessDate}T07:30:00.000Z`
      });

      morningTotal += mQty;
      morningAmount += mAmount;

      if (day < 30) {
        const eQty = parseFloat(baseEvening.toFixed(1));
        const eAmount = calculateAmount(eQty, rate);
        await db.milk_collections.add({
          id: generateId(),
          provider_id: p.id,
          business_date: businessDate,
          session: 'EVENING',
          quantity_litres: eQty,
          rate_per_litre: rate,
          amount: eAmount,
          created_at: `${businessDate}T19:30:00.000Z`,
          updated_at: `${businessDate}T19:30:00.000Z`
        });

        eveningTotal += eQty;
        eveningAmount += eAmount;
      }
    }

    if (day < 30) {
      await db.daily_closings.add({
        id: generateId(),
        business_date: businessDate,
        morning_total_litres: parseFloat(morningTotal.toFixed(2)),
        evening_total_litres: parseFloat(eveningTotal.toFixed(2)),
        total_litres: parseFloat((morningTotal + eveningTotal).toFixed(2)),
        morning_amount: parseFloat(morningAmount.toFixed(2)),
        evening_amount: parseFloat(eveningAmount.toFixed(2)),
        total_amount: parseFloat((morningAmount + eveningAmount).toFixed(2)),
        providers_count: createdProviders.length,
        is_closed: day <= 28,
        closed_at: day <= 28 ? `${businessDate}T21:00:00.000Z` : null
      });
    }
  }

  // Finalize Period 1
  for (const p of createdProviders) {
    const s1Id = generateId();
    const s1Litres = 135.0;
    const s1Rate = p.name.startsWith('Ramesh Patil') ? 50.00 : p.default_rate;
    const s1Amount = calculateAmount(s1Litres, s1Rate);

    await db.settlements.add({
      id: s1Id,
      provider_id: p.id,
      year: 2026,
      month: 8,
      period_index: 1,
      period_start: '2026-08-01',
      period_end: '2026-08-10',
      total_litres: s1Litres,
      total_amount: s1Amount,
      status: 'FINALIZED',
      finalized_at: '2026-08-11T10:00:00.000Z'
    });

    await db.payments.add({
      id: generateId(),
      settlement_id: s1Id,
      provider_id: p.id,
      amount_paid: s1Amount,
      paid_at: '2026-08-11T14:30:00.000Z',
      payment_method: 'CASH',
      notes: 'Period 1 cash settlement paid in full',
      status: 'PAID'
    });
  }

  // Finalize Period 2
  for (let idx = 0; idx < createdProviders.length; idx++) {
    const p = createdProviders[idx];
    const s2Id = generateId();
    const s2Litres = 140.0;
    const s2Amount = calculateAmount(s2Litres, p.default_rate);

    await db.settlements.add({
      id: s2Id,
      provider_id: p.id,
      year: 2026,
      month: 8,
      period_index: 2,
      period_start: '2026-08-11',
      period_end: '2026-08-20',
      total_litres: s2Litres,
      total_amount: s2Amount,
      status: 'FINALIZED',
      finalized_at: '2026-08-21T10:00:00.000Z'
    });

    if (idx % 2 === 0) {
      await db.payments.add({
        id: generateId(),
        settlement_id: s2Id,
        provider_id: p.id,
        amount_paid: s2Amount,
        paid_at: '2026-08-22T11:00:00.000Z',
        payment_method: 'UPI',
        notes: 'Paid via PhonePe UPI',
        status: 'PAID'
      });
    }
  }

  await db.audit_logs.add({
    id: generateId(),
    entity_type: 'PROVIDER',
    entity_id: 'demo-init',
    action: 'CREATE',
    old_value: null,
    new_value: { message: 'Demo dairy loaded with 8 sample providers' },
    reason: 'Loaded sample data for initial demonstration',
    timestamp: '2026-08-01T06:00:00.000Z'
  });

  return true;
}

export async function checkAndSeedDatabase(): Promise<boolean> {
  const hasData = await hasExistingData();
  if (hasData) return false;
  // If first time, load demo data so app is immediately interactive
  return await populateDemoData();
}
