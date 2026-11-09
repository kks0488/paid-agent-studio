"use client";

import { useMemo, useState } from "react";
import { AllCommunityModule, themeQuartz } from "ag-grid-community";
import { AgGridProvider, AgGridReact } from "ag-grid-react";
import { ledgerRows } from "../lib/ledger.js";

const modules = [AllCommunityModule];
const theme = themeQuartz.withParams({
  accentColor: "#587116", backgroundColor: "#ffffff", foregroundColor: "#172023",
  headerBackgroundColor: "#f8f9f5", borderColor: "#e3e6de", fontFamily: "inherit",
  fontSize: 13, headerFontSize: 11, rowHeight: 64, headerHeight: 44,
  wrapperBorder: false, borderRadius: 0,
});
const usd = ({ value }) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
const columns = [
  { field: "orderNumber", headerName: "ORDER", width: 112, cellClass: "mono" },
  { field: "product", headerName: "PRODUCT", minWidth: 205, flex: 1 },
  { field: "package", headerName: "PACKAGE", width: 115, cellClass: "capitalize" },
  { field: "amount", headerName: "PRICE (USD)", width: 130, filter: "agNumberColumnFilter", valueFormatter: usd },
  { field: "status", headerName: "STATUS", width: 192,
    cellRenderer: ({ value, data }) => <span className={`status-pill ${data.statusCode}`}>{value}</span> },
  { field: "captured", headerName: "CAPTURED", width: 125, filter: "agNumberColumnFilter", valueFormatter: usd },
  { field: "refunded", headerName: "REFUNDED", width: 125, filter: "agNumberColumnFilter", valueFormatter: usd },
  { field: "timestamp", headerName: "UPDATED (UTC)", width: 190, sort: "desc",
    valueFormatter: ({ value }) => value ? new Date(value).toISOString().slice(0, 16).replace("T", " ") : "—" },
  { field: "quality", headerName: "CONTENT CHECKS", width: 162 },
];
const defaults = { sortable: true, filter: "agTextColumnFilter", resizable: true, floatingFilter: true };

export default function LedgerGrid({ orders, sample, onOpen }) {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => ledgerRows(orders), [orders]);
  const columnDefs = useMemo(() => sample ? columns : [...columns, {
    colId: "open", headerName: "", width: 90, sortable: false, filter: false,
    cellRenderer: ({ data }) => <button className="text-button" aria-label={`Open order ${data.orderNumber}`}
      onClick={() => onOpen(orders[Number(data.rowKey)])}>Open ↗</button>,
  }], [orders, sample, onOpen]);
  return (
    <div className="ledger-grid-section">
      <div className="ledger-grid-tools">
        <p>{sample ? <><strong className="ledger-sample-label">Sample data</strong> Fictional orders. Create a quote to see your own order trail.</>
          : "Your saved orders, refreshed from this browser’s receipts"}</p>
        <label>Search orders<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Product, status, order…" /></label>
      </div>
      <p className="ledger-grid-hint">Sort any column or use its filter. Scroll sideways for payment totals, time and content checks.</p>
      <div className="ledger-grid" aria-label="Orders, payments, deliveries and refunds">
        <AgGridProvider modules={modules}>
          <AgGridReact theme={theme} rowData={rows} columnDefs={columnDefs} defaultColDef={defaults}
            quickFilterText={search} getRowId={({ data }) => data.rowKey} pagination paginationPageSize={10}
            paginationPageSizeSelector={false} suppressCellFocus={false} animateRows={false} />
        </AgGridProvider>
      </div>
    </div>
  );
}
