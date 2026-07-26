export interface HotelInfo {
  hotel_name: string; address: string; phone: string; email: string
  website: string; gstin: string; pan: string; star_rating: string
}

export interface InvoiceCharge {
  id: string; charge_type: string; description: string; net_amount: number | string
}

export interface InvoiceData {
  invoiceNo: string
  date: string
  guestName: string
  guestEmail?: string
  roomNumber: string
  roomType: string
  checkIn: string
  checkOut: string
  nights: number
  charges: InvoiceCharge[]
  totalCharges: number
  totalTaxes: number
  alreadyPaid: number
  discount: number
  discountAmt: number
  grandTotal: number
  payMethod: string
}

const chargeTypeLabel: Record<string, string> = {
  room: 'Room Charges', restaurant: 'Restaurant Charges', laundry: 'Laundry',
  room_service: 'Room Service', minibar: 'Minibar', telephone: 'Telephone',
  spa: 'Spa & Wellness', tax: 'Tax', discount: 'Discount', other: 'Other Services',
}

export function printInvoice(hotel: HotelInfo, data: InvoiceData) {
  const fmt = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })

  const rows = data.charges.length > 0
    ? data.charges.map(c => `
      <tr>
        <td><strong>${chargeTypeLabel[c.charge_type] || c.charge_type}</strong><br/><small style="color:#666">${c.description || ''}</small></td>
        <td style="text-align:right">${fmt(Number(c.net_amount))}</td>
      </tr>`).join('')
    : `<tr><td>Room Charges — ${data.nights} night(s) × ${fmt(data.totalCharges / (data.nights || 1))}</td><td style="text-align:right">${fmt(data.totalCharges)}</td></tr>`

  const stars = '★'.repeat(Number(hotel.star_rating) || 3)

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice — ${data.invoiceNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1e293b; padding: 32px; max-width: 780px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 3px solid #0D1F40; padding-bottom: 20px; }
    .hotel-name { font-size: 24px; font-weight: 800; color: #0D1F40; letter-spacing: -0.5px; }
    .hotel-sub { font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.6; }
    .invoice-label { font-size: 20px; font-weight: 800; color: #C9A84C; text-align: right; }
    .invoice-meta { font-size: 12px; color: #64748b; text-align: right; margin-top: 4px; line-height: 1.7; }
    .bill-box { background: #f8f9fc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; }
    .bill-box-title { font-weight: 700; color: #0D1F40; margin-bottom: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .bill-box-val { color: #475569; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    thead tr { background: #0D1F40; color: white; }
    thead th { padding: 10px 14px; text-align: left; font-weight: 600; font-size: 12px; }
    thead th:last-child { text-align: right; }
    tbody tr { border-bottom: 1px solid #f1f5f9; }
    tbody td { padding: 10px 14px; vertical-align: top; }
    tbody td:last-child { text-align: right; font-weight: 600; }
    .total-row td { padding: 8px 14px; color: #64748b; border-top: 2px solid #e2e8f0; }
    .paid-row td { padding: 8px 14px; color: #10b981; font-weight: 600; }
    .grand-row td { padding: 12px 14px; background: #fef7e4; font-weight: 800; font-size: 16px; color: #0D1F40; }
    .grand-row td:last-child { color: #C9A84C; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.8; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:flex-start;gap:14px">
      <img src="/src/imports/HOZYN_LOGO.png" alt="HoZyn" style="width:70px;height:70px;object-fit:contain;flex-shrink:0" />
      <div>
        <div class="hotel-name">${hotel.hotel_name}</div>
        <div class="hotel-sub">
          ${stars}<br/>
          ${hotel.address || ''}<br/>
          ${hotel.phone ? `📞 ${hotel.phone}` : ''} ${hotel.email ? `✉ ${hotel.email}` : ''}<br/>
          ${hotel.gstin ? `GSTIN: ${hotel.gstin}` : ''} ${hotel.pan ? `&nbsp;|&nbsp; PAN: ${hotel.pan}` : ''}
        </div>
      </div>
    </div>
    <div>
      <div class="invoice-label">TAX INVOICE</div>
      <div class="invoice-meta">
        <strong>${data.invoiceNo}</strong><br/>
        Date: ${data.date}<br/>
        ${hotel.website || ''}
      </div>
    </div>
  </div>

  <div class="bill-box">
    <div class="bill-box-title">Billed To</div>
    <div class="bill-box-val">
      <strong>${data.guestName}</strong><br/>
      Room ${data.roomNumber} — ${data.roomType}<br/>
      Check-in: ${data.checkIn} &nbsp;→&nbsp; Check-out: ${data.checkOut} (${data.nights} night${data.nights !== 1 ? 's' : ''})<br/>
      ${data.guestEmail ? data.guestEmail : ''}
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${rows}
      ${data.totalTaxes > 0 ? `<tr class="total-row"><td>Taxes &amp; Fees</td><td style="text-align:right">${fmt(data.totalTaxes)}</td></tr>` : ''}
      <tr class="grand-row"><td>Grand Total</td><td>${fmt(data.totalCharges + data.totalTaxes)}</td></tr>
    </tbody>
  </table>

  <div class="footer">
    Payment Method: ${data.payMethod.replace(/_/g, ' ').toUpperCase()}<br/>
    Thank you for choosing ${hotel.hotel_name}! We hope to see you again.<br/>
    ${hotel.website ? `🌐 ${hotel.website}` : ''}
  </div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => { win.focus(); win.print() }, 600)
}
