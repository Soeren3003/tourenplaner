import { Fragment, useState } from "react";
import { BarList } from "../../components/charts";
import { MemberDot, MemberPicker } from "../../components/common";
import { Empty, NumberInput } from "../../components/ui";
import { balances, byCategory, expenseAmount, normalizeRiders, settle } from "../../lib/calc";
import { CATEGORIES, CURRENCIES, newExpense } from "../../lib/defaults";
import { date, money, num } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { TourSummary } from "../../lib/summary";
import type { Expense, ExpenseCategory, Tour } from "../../lib/types";

export default function Costs({ tour, sum }: { tour: Tour; sum: TourSummary }) {
  const store = useStore();
  const [openSplit, setOpenSplit] = useState("");
  const [copied, setCopied] = useState(false);
  const cur = tour.currency;
  const m = (n: number) => money(n, cur);
  const member = (id: string) => store.members.find((x) => x.id === id);
  const memberName = (id: string) => member(id)?.name || "?";

  const expenses = store.expenses.filter((e) => e.tourId === tour.id).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const bal = balances(tour.memberIds, sum.items);
  const transfers = settle(bal);
  const cats = byCategory(sum.items);
  const unpaidHotels = sum.hotels.filter((h) => h.status !== "cancelled" && h.price > 0 && !h.paidBy);

  const set = (e: Expense, patch: Partial<Expense>) => store.save("expenses", { ...e, ...patch });

  const add = () => {
    const last = expenses[expenses.length - 1];
    const today = new Date().toISOString().slice(0, 10);
    const d = today >= tour.startDate && today <= tour.endDate ? today : (last?.date ?? tour.startDate);
    const payer = tour.memberIds.includes(store.me) ? store.me : (tour.memberIds[0] ?? "");
    // Fahren an dem Tag nicht alle, wird die Ausgabe zunächst nur auf die Mitfahrenden verteilt.
    const riders = new Set(sum.stages.filter((s) => s.date === d).flatMap((s) => sum.ridersOf(s).map((m) => m.id)));
    store.save("expenses", { ...newExpense(tour, payer, d), splitAmong: riders.size ? normalizeRiders([...riders], tour.memberIds) : [] });
  };

  const copyText = async () => {
    const lines = [
      `${tour.name} – Abrechnung`,
      `Gesamt: ${m(sum.costs)} · pro Person Ø ${m(sum.costs / Math.max(1, tour.memberIds.length))}`,
      "",
      ...bal.map((b) => `${memberName(b.memberId)}: ausgelegt ${m(b.paid)}, Anteil ${m(b.share)}, Saldo ${b.balance >= 0 ? "+" : ""}${m(b.balance)}`),
      "",
      ...(transfers.length ? transfers.map((t) => `➜ ${memberName(t.from)} zahlt ${m(t.amount)} an ${memberName(t.to)}`) : ["Alles ausgeglichen 👍"]),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!tour.memberIds.length) return <Empty>Wähle im Überblick zuerst die Mitfahrer dieser Tour aus – dann lassen sich Kosten aufteilen.</Empty>;

  return (
    <div className="split">
      <div className="main-col">
        <section className="card">
          <div className="card-head">
            <h2>Ausgaben</h2>
            <button className="primary small" onClick={add}>
              + Ausgabe
            </button>
          </div>
          {expenses.length === 0 && sum.items.length === 0 ? (
            <p className="muted small">Noch keine Ausgaben. Unterkünfte mit Preis werden automatisch berücksichtigt.</p>
          ) : (
            <table className="edit costs-table">
              <thead>
                <tr>
                  <th className="w-date">Datum</th>
                  <th>Wofür</th>
                  <th className="w-cat">Kategorie</th>
                  <th className="w-amount r">Betrag</th>
                  <th className="w-payer">Bezahlt von</th>
                  <th className="w-split">Für</th>
                  <th className="w-act" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => {
                  const foreign = e.currency !== cur;
                  return (
                    <Fragment key={e.id}>
                      <tr>
                        <td>
                          <input type="date" value={e.date} onChange={(ev) => ev.target.value && set(e, { date: ev.target.value })} />
                        </td>
                        <td>
                          <input value={e.title} placeholder={CATEGORIES[e.category].label} onChange={(ev) => set(e, { title: ev.target.value })} />
                        </td>
                        <td>
                          <select value={e.category} onChange={(ev) => set(e, { category: ev.target.value as ExpenseCategory })}>
                            {Object.entries(CATEGORIES).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v.icon} {v.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="amount-cell">
                            <NumberInput value={e.amount} onChange={(v) => set(e, { amount: v ?? 0 })} />
                            <select className="cur" value={e.currency} onChange={(ev) => set(e, { currency: ev.target.value, rate: ev.target.value === cur ? 1 : e.rate })}>
                              {CURRENCIES.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          {foreign && (
                            <div className="rate-row small muted">
                              1 {e.currency} =
                              <NumberInput value={e.rate} digits={4} onChange={(v) => set(e, { rate: v ?? 1 })} /> {cur} → {m(expenseAmount(e))}
                            </div>
                          )}
                        </td>
                        <td>
                          <select value={e.paidBy} onChange={(ev) => set(e, { paidBy: ev.target.value })}>
                            <option value="">Jeder selbst</option>
                            {sum.members.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button className="ghost small split-btn" onClick={() => setOpenSplit(openSplit === e.id ? "" : e.id)}>
                            {e.splitAmong.filter((id) => tour.memberIds.includes(id)).length === 0
                              ? "Alle"
                              : e.splitAmong
                                  .filter((id) => tour.memberIds.includes(id))
                                  .map((id) => <MemberDot key={id} member={member(id)} size={16} />)}
                          </button>
                        </td>
                        <td>
                          <button className="icon danger" onClick={() => store.remove("expenses", e.id)} title="Löschen">
                            ×
                          </button>
                        </td>
                      </tr>
                      {openSplit === e.id && (
                        <tr className="details">
                          <td colSpan={7}>
                            <span className="muted small">Aufteilen auf: </span>
                            <MemberPicker members={sum.members} selected={e.splitAmong} onChange={(splitAmong) => set(e, { splitAmong })} allLabel="Alle" />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {sum.items
                  .filter((i) => i.source === "hotel")
                  .map((i) => (
                    <tr key={i.id} className="static derived">
                      <td>{date(i.date)}</td>
                      <td>{i.title}</td>
                      <td>🛏 Unterkunft</td>
                      <td className="r">{m(i.amount)}</td>
                      <td>{i.paidBy ? memberName(i.paidBy) : "Jeder selbst"}</td>
                      <td className="muted small" colSpan={2}>
                        aus „Unterkünfte“
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td colSpan={3}>Gesamt</td>
                  <td className="r">{m(sum.costs)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          )}
        </section>
      </div>

      <aside className="side-col">
        <section className="card">
          <div className="card-head">
            <h2>Wer zahlt wem?</h2>
            <button className="ghost small" onClick={copyText} disabled={!sum.items.length}>
              {copied ? "Kopiert ✓" : "Als Text kopieren"}
            </button>
          </div>
          {transfers.length === 0 ? (
            <p className="muted">{sum.items.length ? "Alles ausgeglichen 👍" : "Noch nichts abzurechnen."}</p>
          ) : (
            <ul className="transfers">
              {transfers.map((t, i) => (
                <li key={i}>
                  <MemberDot member={member(t.from)} /> {memberName(t.from)} <span className="arrow">→</span> <MemberDot member={member(t.to)} /> {memberName(t.to)}
                  <strong>{m(t.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
          {unpaidHotels.length > 0 && (
            <p className="muted small">
              {unpaidHotels.length} Unterkunft/Unterkünfte ohne „bezahlt von“ – dort zahlt jeder seinen Anteil selbst.
            </p>
          )}
        </section>

        <section className="card">
          <h2>Salden</h2>
          <table className="list compact">
            <thead>
              <tr>
                <th>Name</th>
                <th className="r">ausgelegt</th>
                <th className="r">Anteil</th>
                <th className="r">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {bal.map((b) => (
                <tr key={b.memberId} className="static">
                  <td>
                    <MemberDot member={member(b.memberId)} size={16} /> {memberName(b.memberId)}
                  </td>
                  <td className="r">{m(b.paid)}</td>
                  <td className="r">{m(b.share)}</td>
                  <td className={`r ${b.balance < 0 ? "neg" : b.balance > 0 ? "pos" : ""}`}>
                    {b.balance > 0 ? "+" : ""}
                    {m(b.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {cats.length > 0 && (
          <section className="card">
            <h2>Nach Kategorie</h2>
            <BarList items={cats.map((c) => ({ label: `${CATEGORIES[c.category].icon} ${CATEGORIES[c.category].label}`, value: c.amount }))} format={m} />
          </section>
        )}

        {sum.energyEstimate > 0 && (
          <section className="card">
            <h2>Energieschätzung</h2>
            {sum.energy?.fuel && !sum.hasFuelExpenses && (
              <p className="small">
                ⛽ Verbrenner, je Etappe nur die Mitfahrenden ≈ <strong>{num(sum.energy.fuel.amount, 1)} l</strong> × {money(tour.fuelPrice, cur)} ={" "}
                <strong>{m(sum.energy.fuel.cost)}</strong>
              </p>
            )}
            {sum.energy?.electric && !sum.hasChargingExpenses && (
              <p className="small">
                🔌 E-Motorräder, je Etappe nur die Mitfahrenden ≈ <strong>{num(sum.energy.electric.amount, 1)} kWh</strong> × {money(tour.electricityPrice, cur)} ={" "}
                <strong>{m(sum.energy.electric.cost)}</strong>
              </p>
            )}
            <p className="muted small">Wird ersetzt, sobald echte Tank- bzw. Ladebelege (Kategorie „Sprit“ bzw. „Laden“) erfasst sind.</p>
          </section>
        )}
      </aside>
    </div>
  );
}
