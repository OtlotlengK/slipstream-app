const SUPABASE_URL = 'https://pddjualtnhgmplampucn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_31VRHyY4ze-5FqJU7CKooA_PzYUIYCH';

if (!window.supabase?.createClient) { throw new Error('ValoraTap secure connection library failed to load. Please refresh the page.'); }
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const params = new URLSearchParams(window.location.search);
const invoiceId = params.get('id');
const invoiceNumber = params.get('invoice');
let invoice = null;
let popPreviewUrl = '';

const money = (value, currency = 'ZAR') => new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: /^[A-Z]{3}$/.test(String(currency)) ? String(currency) : 'ZAR'
}).format(Number(value) || 0);

const $ = (selector) => document.querySelector(selector);

function showMessage(text, type = '') {
  const el = $('#message');
  el.textContent = text;
  el.className = `notice ${type}`;
  el.classList.remove('hidden');
}

async function findInvoice() {
  if (/^[0-9a-f-]{36}$/i.test(invoiceId || '')) {
    return db.rpc('get_merchant_invoice', { p_invoice_id: invoiceId }).maybeSingle();
  }
  if (invoiceNumber) {
    const { data: invoices, error: listError } = await db.rpc('get_merchant_invoices');
    if (listError) return { data: null, error: listError };
    const match = (invoices || []).find(item =>
      String(item.invoice_no || '').toLowerCase() === String(invoiceNumber).toLowerCase()
    );
    if (!match?.id) {
      return { data: null, error: { message: 'Invoice not found or you do not have access to it.' } };
    }
    return db.rpc('get_merchant_invoice', { p_invoice_id: match.id }).maybeSingle();
  }
  return { data: null, error: { message: 'Missing invoice reference.' } };
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
    popPreviewUrl = url;

    if (url.toLowerCase().includes('.pdf')) {
      $('#pop').innerHTML = `<iframe title="Proof of payment" src="${url.replace(/"/g, '&quot;')}"></iframe>`;
    } else {
      $('#pop').innerHTML = `<img id="popImage" alt="Proof of payment" src="${url.replace(/"/g, '&quot;')}">`;
    }
    if (!url.toLowerCase().includes('.pdf')) {
      await runImageOcr();
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

    if (!invoiceId && !invoiceNumber) {
      showMessage('No payment was selected. Opening the payment review queue…', 'error');
      setTimeout(() => {
        window.location.href = 'invoice-centre.html?filter=payment_submitted';
      }, 350);
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
    $('#total').textContent = money(data.total, data.currency);
    $('#submitted').textContent = data.payment_submitted_at
      ? new Date(data.payment_submitted_at).toLocaleString('en-ZA')
      : '—';

    await loadPop(session.access_token);
    await loadShield();
  } catch (error) {
    showMessage(`Unable to load payment review: ${error?.message || 'Unexpected error'}`, 'error');
  }
}

async function runImageOcr() {
  if (!window.Tesseract || !invoice) return;
  const image = document.querySelector('#popImage');
  if (!image) return;

  try {
    $('#popMeta').textContent = 'Secure preview · scanning transaction fields…';
    const worker = await Tesseract.createWorker('eng', 1, {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      logger: () => {}
    });
    const result = await worker.recognize(image, { rotateAuto: true });
    await worker.terminate();

    const text = String(result?.data?.text || '').trim();
    if (text.length < 20) {
      $('#popMeta').textContent = 'Secure preview · OCR could not extract enough text to compare.';
      return;
    }

    const { error } = await db.rpc('record_invoice_pop_ocr', {
      p_invoice_id: invoice.id,
      p_ocr_text: text.slice(0, 12000)
    });

    if (error) {
      console.warn('POP OCR evidence save failed', error);
      $('#popMeta').textContent = 'Secure preview · OCR completed, but comparison could not be saved.';
      return;
    }

    $('#popMeta').textContent = 'Secure preview · transaction fields extracted and compared.';
    await loadShield();
  } catch (error) {
    console.warn('POP OCR failed', error);
    $('#popMeta').textContent = 'Secure preview · OCR unavailable for this image. Review the proof manually.';
  }
}

async function loadShield() {
  const { data, error } = await db.rpc('get_invoice_pop_shield', { p_invoice_id: invoice.id });
  if (error) {
    console.warn('POP Shield lookup failed', error);
    return;
  }
  const status = data?.status || 'unconfirmed';
  const meta = {
    verified: ['Verified Payment','settlement independently confirmed','green'],
    unconfirmed: ['Unconfirmed','POP is consistent with this invoice, but settlement is not independently confirmed','amber'],
    suspicious: ['Suspicious','evidence conflicts with invoice or payment information','red'],
    duplicate: ['Duplicate','this exact POP file has already been submitted','slate']
  }[status] || ['Unconfirmed','Settlement still needs independent confirmation','amber'];
  const el = document.querySelector('#shieldStatus');
  if (el) {
    el.className = 'shield '+meta[2];
    el.innerHTML = '<strong>POP Shield · '+meta[0]+'</strong><span>'+meta[1]+'</span>';
  }
  const checks = data?.checks || {};
  const evidence = data?.evidence || {};
  const fields = document.querySelector('#evidenceFields');
  if (fields && evidence?.source === 'ocr') {
    const fmt = v => v === null || v === undefined || v === '' ? 'Not found' : String(v);
    fields.classList.remove('hidden');
    fields.innerHTML = [['Amount', evidence.amount == null ? 'Not found' : money(evidence.amount, data?.currency || invoice.currency)],['Currency',fmt(evidence.currency)],['Reference',fmt(evidence.reference)],['Transaction date',fmt(evidence.transaction_date)]].map(([label,value]) => '<div class="shield-check"><span>'+label+'</span><strong>'+String(value).replace(/[&<>]/g,'')+'</strong></div>').join('');
  }
  const checksEl = document.querySelector('#shieldChecks');
  if (checksEl) {
    checksEl.innerHTML = [
      ['Invoice match', checks.invoice_match],
      ['File integrity', checks.file_integrity],
      ['Duplicate check', checks.duplicate === false],
      ['Evidence extracted', checks.evidence_extracted],['Amount match', checks.amount_checked],['Currency match', checks.currency_checked],['Reference found', checks.reference_checked],['Settlement confirmed', checks.settlement_confirmed]
    ].map(([label,ok]) => '<div class="shield-check"><span>'+label+'</span><strong class="'+(ok?'ok':'pending')+'">'+(ok?'✓ Passed':'— Pending')+'</strong></div>').join('');
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
    window.location.href = `verify.html?hash=${encodeURIComponent(hash)}`;
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
