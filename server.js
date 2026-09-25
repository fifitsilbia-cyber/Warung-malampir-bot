require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const ADMIN_PIN = process.env.ADMIN_PIN || '0000';
const DATA_PATH = path.join(__dirname, 'data.json');

// ---------- Helper: baca & simpan data.json ----------
function loadData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}
function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}
function formatRupiah(n) {
  return 'Rp' + n.toLocaleString('id-ID');
}

// ---------- Helper: kirim balasan lewat Fonnte ----------
async function kirimWA(target, message) {
  try {
    await axios.post(
      'https://api.fonnte.com/send',
      { target, message },
      { headers: { Authorization: FONNTE_TOKEN } }
    );
  } catch (err) {
    console.error('Gagal kirim WA:', err.response ? err.response.data : err.message);
  }
}

// ---------- Susun teks menu ----------
function teksMenu() {
  const data = loadData();
  let t = `*${data.toko.nama}*\n\n`;
  t += `*${data.paket.nama}* - ${formatRupiah(data.paket.harga)}\n`;
  t += `Isi: ${data.paket.isi.join(', ')}\n`;
  t += data.paket.tersedia ? '' : '_(paket sedang habis)_\n';
  t += `\n*Topping Tambahan:*\n`;
  data.topping.forEach((tp) => {
    t += `- ${tp.nama}: ${formatRupiah(tp.harga)}${tp.tersedia ? '' : ' (habis)'}\n`;
  });
  t += `\nSayur: gratis, pilih pakai atau tidak\n`;
  t += `Level pedas: ${data.levelPedas.join(', ')}\n`;
  t += `\n*Minuman:*\n`;
  data.minuman.forEach((m) => {
    t += `- ${m.nama}: ${formatRupiah(m.harga)}${m.tersedia ? '' : ' (habis)'}\n`;
  });
  return t;
}

function teksStatus() {
  const data = loadData();
  return data.toko.buka
    ? `Toko *BUKA* ✅\nJam buka: ${data.toko.jamBuka}\nSilakan order sekarang!`
    : `Toko *TUTUP* ❌\nJam buka: ${data.toko.jamBuka}\nSilakan order saat jam buka ya.`;
}

function teksCaraPesan() {
  return (
    `*Cara Pesan:*\n` +
    `1. Balas chat ini dengan menu yang mau dipesan (paket + topping tambahan + level pedas + minuman kalau mau)\n` +
    `2. Tunggu konfirmasi total harga dari kami\n` +
    `3. Pesanan diambil lewat kurir Gojek / Grab / ShopeePay ke alamat Warung Seblak Malampir\n` +
    `4. Bayar langsung ke kurir sesuai metode yang dipilih`
  );
}

function teksMenuUtama() {
  return (
    `Halo, selamat datang di *Warung Seblak Malampir*! 🌶️\n\n` +
    `Ketik angka pilihan:\n` +
    `1. Lihat Menu\n` +
    `2. Cek Buka/Tutup\n` +
    `3. Cara Pesan\n` +
    `4. Kritik & Saran`
  );
}

function teksKritikSaran() {
  const data = loadData();
  return `Kritik & saran bisa dikirim ke nomor: ${data.toko.kritikSaran}\nTerima kasih! 🙏`;
}

// ---------- Perintah admin (BUKA/TUTUP/STOK/STATUS/PANEL) ----------
async function prosesAdmin(pesan, sender) {
  const parts = pesan.trim().split(/\s+/);
  const perintah = parts[0].toUpperCase();
  const pin = parts[parts.length - 1];

  if (pin !== ADMIN_PIN) {
    await kirimWA(sender, 'PIN salah.');
    return true;
  }

  const data = loadData();

  if (perintah === 'BUKA') {
    data.toko.buka = true;
    saveData(data);
    await kirimWA(sender, 'Status toko diubah jadi BUKA ✅');
    return true;
  }

  if (perintah === 'TUTUP') {
    data.toko.buka = false;
    saveData(data);
    await kirimWA(sender, 'Status toko diubah jadi TUTUP ❌');
    return true;
  }

  if (perintah === 'STATUS') {
    await kirimWA(sender, teksStatus());
    return true;
  }

  if (perintah === 'PANEL') {
    await kirimWA(
      sender,
      `*Perintah Admin:*\nBUKA [PIN]\nTUTUP [PIN]\nSTATUS [PIN]\nSTOK [nama item] [ON/OFF] [PIN]\nPANEL [PIN]`
    );
    return true;
  }

  if (perintah === 'STOK') {
    // format: STOK <nama item> <ON/OFF> <PIN>
    if (parts.length < 4) {
      await kirimWA(sender, 'Format salah. Contoh: STOK ceker OFF 1234');
      return true;
    }
    const status = parts[parts.length - 2].toUpperCase();
    const namaItem = parts.slice(1, parts.length - 2).join(' ').toLowerCase();
    const tersedia = status === 'ON';

    let ditemukan = false;
    if (data.paket.nama.toLowerCase().includes(namaItem)) {
      data.paket.tersedia = tersedia;
      ditemukan = true;
    }
    data.topping.forEach((tp) => {
      if (tp.nama.toLowerCase() === namaItem) {
        tp.tersedia = tersedia;
        ditemukan = true;
      }
    });
    data.minuman.forEach((m) => {
      if (m.nama.toLowerCase() === namaItem) {
        m.tersedia = tersedia;
        ditemukan = true;
      }
    });

    if (ditemukan) {
      saveData(data);
      await kirimWA(sender, `Stok "${namaItem}" diubah jadi ${tersedia ? 'ADA' : 'HABIS'} ✅`);
    } else {
      await kirimWA(sender, `Item "${namaItem}" tidak ditemukan di data menu.`);
    }
    return true;
  }

  return false;
}

// ---------- Webhook utama dari Fonnte ----------
app.post('/webhook', async (req, res) => {
  const pesanMasuk = (req.body.message || '').trim();
  const sender = req.body.sender || req.body.pengirim;

  if (!pesanMasuk || !sender) {
    return res.sendStatus(200);
  }

  // Cek dulu apakah ini perintah admin
  const adminKeywords = ['BUKA', 'TUTUP', 'STOK', 'STATUS', 'PANEL'];
  const kataPertama = pesanMasuk.trim().split(/\s+/)[0].toUpperCase();

  if (adminKeywords.includes(kataPertama)) {
    const ditangani = await prosesAdmin(pesanMasuk, sender);
    if (ditangani) return res.sendStatus(200);
  }

  // Menu customer
  switch (pesanMasuk) {
    case '1':
      await kirimWA(sender, teksMenu());
      break;
    case '2':
      await kirimWA(sender, teksStatus());
      break;
    case '3':
      await kirimWA(sender, teksCaraPesan());
      break;
    case '4':
      await kirimWA(sender, teksKritikSaran());
      break;
    default:
      await kirimWA(sender, teksMenuUtama());
  }

  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Bot Warung Seblak Malampir aktif.');
});

app.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
});
