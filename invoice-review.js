const SUPABASE_URL = 'https://pddjualtnhgmplampucn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const params = new URLSearchParams(window.location.search);
const invoiceId = params.get('id');
const invoiceNumber = params.get('invoice');
let invoice = null;

const money = (value) => new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR'
}).format(Number(value) || 0);

const $ = (selector) => document.querySelector(selector);

function showMessage(text, type = '') {
  const el = $('#message');
  el.textContent = text;
  el.className = `notice ${type}`;
  el.classList.remove('hidden');
}

async function findInvoice() {
  let query = db
    .from('invoices')
    .select('id,invoice_no,customer_name,total,status,payment_submitted_at,pop_path');

  if (/^[0-9a-f-]{36}$/i.test(invoiceId || '')) {
    query = query.eq('id', invoiceId);
  } else if (invoiceNumber) {
    query = query.eq('invoice_no', invoiceNumber);
  } else {
    return { data: null, error: { message: 'Missing invoice reference.' } };
  }

  return query.maybeSingle();
}

async function loadPop(accessToken) {
  if (!invoice?.pop_path) {
    $('#popMeta').textContent = 'No proof of payment was uploaded by the client.';
    $('#pop').innerHTML = `
      <div class="muted" style="text-align:center;padding:30px">
        No proof of payment uploaded.<br><br>
        <strong>You can still confirm the payment</strong><br>
        if you have independently verified that the funds were received.
      </div>`;
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/invoice-pop-view`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ invoice_id: invoice.id })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.signed_url) {
      throw new Error(result.error || 'Secure POP preview unavailable.');
    }

    $('#popMeta').textContent = 'Secure preview · link expires in 5 minutes';
    const url = result.signed_url;

    if (url.toLowerCase().includes('.pdf')) {
      $('#pop').innerHTML = `<iframe title="Proof of payment" src="${url.replace(/"/g, '&quot;')}"></iframe>`;
    } else {
      $('#pop').innerHTML = `<img alt="Proof of payment" src="${url.replace(/"/g, '&quot;')}">`;
    }
  } catch (error) {
    $('#popMeta').textContent = 'Proof of payment is on file, but the secure preview is currently unavailable.';
    $('#pop').innerHTML = `
      <div class="muted" style="text-align:center;padding:30px">
        Proof of payment is on file, but the secure preview could not be loaded.<br><br>
        <strong>You can still confirm the payment</strong><br>
        after checking your banking records.
      </div>`;
  }
}

async function init() {
  try {
    const { data: sessionData, error: sessionError } = await db.auth.getSession();

    if (sessionError) {
      showMessage('Unable to load your session. Please refresh and sign in.', 'error');
      return;
    }

    const session = sessionData?.session;
    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    const { data, error } = await findInvoice();

    if (error) {
      showMessage(`Unable to load invoice: ${error.message || 'Unknown database error'}`, 'error');
      return;
    }

    if (!data) {
      showMessage('Invoice not found or you do not have access to it. Please return to Invoice Vault and open Review from there.', 'error');
      return;
    }

    if (data.status !== 'payment_submitted') {
      showMessage(`This invoice is not currently awaiting payment review. Current status: ${(data.status || 'unknown').replaceAll('_', ' ')}`, 'error');
      return;
    }

    invoice = data;

    $('#content').classList.remove('hidden');
    $('#invoiceNo').textContent = data.invoice_no || '—';
    $('#client').textContent = data.customer_name || '—';
    $('#total').textContent = money(data.total);
    $('#submitted').textContent = data.payment_submitted_at
      ? new Date(data.payment_submitted_at).toLocaleString('en-ZA')
      : '—';

    await loadPop(session.access_token);
  } catch (error) {
    showMessage(`Unable to load payment review: ${error?.message || 'Unexpected error'}`, 'error');
  }
}

async function confirmPayment() {
  if (!invoice) return;
  if (!window.confirm('Confirm that this payment has been received? ValoraTap will create the final receipt.')) return;

  const button = $('#confirm');
  button.disabled = true;
  button.textContent = 'Confirming…';

  const { data, error } = await db.rpc('confirm_invoice_payment', {
    p_invoice_id: invoice.id
  });

  if (error) {
    button.disabled = false;
    button.textContent = '✓ Confirm Payment & Issue Receipt';
    showMessage(error.message || 'Payment confirmation failed.', 'error');
    return;
  }

  const hash = data?.verification_hash;
  if (!hash) {
    button.disabled = false;
    button.textContent = '✓ Confirm Payment & Issue Receipt';
    showMessage('Payment was confirmed, but the receipt reference was not returned.', 'error');
    return;
  }

  showMessage('Payment confirmed. Receipt created successfully.', 'success');
  setTimeout(() => {
    window.location.href = `digital-receipts.html?hash=${encodeURIComponent(hash)}`;
  }, 700);
}

function showReject() {
  $('#rejectBox').classList.remove('hidden');
  $('#reason').focus();
}

async function rejectPayment() {
  if (!invoice) return;

  const reason = $('#reason').value.trim();
  if (!window.confirm('Reject this payment submission? The invoice will return to awaiting payment.')) return;

  const { error } = await db.rpc('reject_invoice_payment', {
    p_invoice_id: invoice.id,
    p_reason: reason || null
  });

  if (error) {
    showMessage(error.message || 'Unable to reject payment.', 'error');
    return;
  }

  showMessage('Payment submission rejected. The invoice is back in awaiting-payment status.', 'success');
  setTimeout(() => {
    window.location.href = 'invoice-centre.html';
  }, 700);
}

async function logout() {
  await db.auth.signOut();
  window.location.href = 'login.html';
}

window.addEventListener('DOMContentLoaded', () => {
  $('#confirm')?.addEventListener('click', confirmPayment);
  $('#rejectShow')?.addEventListener('click', showReject);
  $('#rejectConfirm')?.addEventListener('click', rejectPayment);
  $('#rejectCancel')?.addEventListener('click', () => $('#rejectBox').classList.add('hidden'));
  $('#logoutBtn')?.addEventListener('click', logout);
  init();
});
