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
      The handoff book
    </Link>
  );
  if (!order)
    return (
      <EmptyState title="Prepare a hire record first." action={back}>
        Supplier exports use the exact units, date windows and quotes saved in
        your sourcing book.
      </EmptyState>
    );
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
            <p>WARDROBE / SUPPLIER HANDOFF</p>
          </div>
          <div>
            <strong>WORKING HIRE ORDER</strong>
            <span>Source {revision(project.revision)}</span>
          </div>
        </header>
        <div className={styles.title}>
          <p>{project.title}</p>
          <h1>{order.supplier}</h1>
          <span>
            {order.requests.length} hire{" "}
            {order.requests.length === 1 ? "record" : "records"} ·{" "}
            {project.currency} · Times in {project.timeZone}
          </span>
        </div>
        <div className={styles.flow}>
          Quote <span>→</span> Hire confirmation <span>→</span> Receipt{" "}
          <span>→</span> Return
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
                  ? `${request.status} · needs renewed review`
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
                    <small>1 physical unit</small>
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
              <span>
                {request.provenance === "synthetic"
                  ? "Synthetic sample"
                  : "Manually recorded"}
              </span>
              <p>
                {request.externalReference
                  ? `Reference: ${request.externalReference}`
                  : "Supplier reference pending"}
                {request.operator ? ` · Recorded by ${request.operator}` : ""}
              </p>
              {request.evidence && <p>{request.evidence}</p>}
              {request.note && <p>{request.note}</p>}
            </div>
            <footer className={styles.recordFooter}>
              <span>Record {request.id}</span>
              <span>
                Updated {hireOrderDate(request.updatedAt, project.timeZone)} ·
                source {revision(request.sourceRevision)}
              </span>
            </footer>
          </section>
        ))}
        <footer className={styles.footer}>
          Prepared from the saved production at {revision(project.revision)}.
          Exporting does not send an order, make a payment, or confirm
          availability. Status and evidence belong to each record; review any
          flagged record before sharing.
        </footer>
      </article>
    </div>
  );
}
