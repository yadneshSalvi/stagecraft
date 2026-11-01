"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Download, Printer } from "lucide-react";
import {
  hireOrderCsv,
  hireOrderDate,
  hireOrderFilename,
  supplierHireOrders,
} from "@/lib/hire-orders";
import { displayFixtureText } from "@/lib/presentation-copy";
import { money, revision } from "@/lib/format";
import { useProduction } from "./production-context";
import { Button, EmptyState } from "./ui";
import styles from "./supplier-hire-orders.module.css";

export function SupplierHireOrders() {
  const { project } = useProduction();
  const [chosen, setChosen] = useState<string | null>(null);
  const orders = supplierHireOrders(project);
  const order = orders.find((entry) => entry.supplier === chosen) || orders[0];
  const back = (
    <Link className="button" href={`/production/${project.id}/handoff`}>
      <ArrowLeft size={15} />
      Handoff
    </Link>
  );
  if (!order) return <EmptyState title="No hire records" action={back} />;
  function download() {
    const file = new Blob([hireOrderCsv(project, order.supplier)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = hireOrderFilename(order.supplier, project.revision);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className={styles.page}>
      <div className={`${styles.toolbar} no-print`}>
        {back}
        <div>
          <Button onClick={download}>
            <Download size={15} />
            Download supplier CSV
          </Button>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer size={15} />
            Print / save PDF
          </Button>
        </div>
      </div>
      <div className={`${styles.select} no-print`}>
        <label htmlFor="hire-order-supplier">Supplier</label>
        <select
          id="hire-order-supplier"
          value={order.supplier}
          onChange={(event) => setChosen(event.target.value)}
        >
          {orders.map((entry) => (
            <option key={entry.supplier} value={entry.supplier}>
              {entry.supplier}
            </option>
          ))}
        </select>
      </div>
      <article
        className={styles.paper}
        aria-label={`Hire orders for ${order.supplier}`}
      >
        <header className={styles.header}>
          <div>
            <span className={styles.brand}>STAGECRAFT</span>
          </div>
          <div>
            <strong>Hire order</strong>
          </div>
        </header>
        <div className={styles.title}>
          <p>{project.title}</p>
          <h1>{displayFixtureText(order.supplier, project.fixture)}</h1>
          <span>
            {order.requests.length} hire{" "}
            {order.requests.length === 1 ? "record" : "records"} ·{" "}
            {project.currency} · Times in {project.timeZone}
          </span>
        </div>
        {order.requests.map((request, index) => (
          <section
            className={styles.record}
            key={request.id}
            aria-labelledby={`hire-order-${index}`}
          >
            <div className={styles.recordHead}>
              <h2 id={`hire-order-${index}`}>
                Hire record {String(index + 1).padStart(2, "0")}
              </h2>
              <span className={request.stale ? styles.stale : styles.status}>
                {request.stale
                  ? `${request.status} · re-review`
                  : request.status}
              </span>
            </div>
            <ul className={styles.units}>
              {request.unitIds.map((id) => {
                const unit = project.units.find((item) => item.id === id);
                return (
                  <li key={id}>
                    <strong>{unit?.code || id}</strong>
                    <span>
                      {unit?.name || "Unit no longer in working book"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <dl className={styles.facts}>
              <div>
                <dt>From</dt>
                <dd>{hireOrderDate(request.from, project.timeZone)}</dd>
              </div>
              <div>
                <dt>Return by</dt>
                <dd>{hireOrderDate(request.to, project.timeZone)}</dd>
              </div>
              <div>
                <dt>Quote · whole record</dt>
                <dd>{money(request.quoteCents, project.currency)}</dd>
              </div>
              <div>
                <dt>Quote valid until</dt>
                <dd>
                  {hireOrderDate(request.quoteValidUntil, project.timeZone)}
                </dd>
              </div>
            </dl>
            <div className={styles.evidence}>
              <p>
                {request.externalReference
                  ? `Reference: ${request.externalReference}`
                  : "Supplier reference pending"}
                {request.operator ? ` · Recorded by ${request.operator}` : ""}
              </p>
              {request.evidence && (
                <p>{displayFixtureText(request.evidence, project.fixture)}</p>
              )}
              {request.note && (
                <p>{displayFixtureText(request.note, project.fixture)}</p>
              )}
            </div>
            <footer className={styles.recordFooter}>
              <span>
                Updated {hireOrderDate(request.updatedAt, project.timeZone)}
              </span>
            </footer>
          </section>
        ))}
        <footer className={styles.footer}>
          Prepared from {revision(project.revision)}. Not sent to suppliers.
        </footer>
      </article>
    </div>
  );
}
