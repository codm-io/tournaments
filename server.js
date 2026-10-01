const express = require('express');
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

// Safely pull and format environment variables
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

if (!projectId || !clientEmail || !privateKey) {
  console.error("ERROR: Missing Firebase environment variables on Render!");
}

// Initialize Firebase Admin using the modular syntax
const appFirebase = initializeApp({
  credential: cert({
    projectId: projectId,
    clientEmail: clientEmail,
    privateKey: privateKey
  }),
  databaseURL: "https://codm-19d8b-default-rtdb.firebaseio.com/"
});

const db = getDatabase(appFirebase);
const app = express();
app.use(express.json());

// 1. Initiate PalPluss STK Push Payment
app.post('/api/initiate-payment', async (req, res) => {
    const { amount, phone, userId, accountReference } = req.body;

    if (!amount || !phone || !userId) {
        return res.status(400).json({ success: false, error: 'Missing payment fields' });
    }

    try {
        const response = await fetch('https://api.palpluss.com/v1/payments/stk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${process.env.PALPLUSS_API_KEY}`
            },
            body: JSON.stringify({
                amount: Number(amount),
                phone: phone,
                accountReference: accountReference || 'CODM-TOPUP'
            })
        });

        const result = await response.json();

        if (response.ok) {
            return res.json({ success: true, message: 'STK push sent', data: result });
        } else {
            return res.status(response.status).json({ success: false, error: result.message || 'Payment initiation failed' });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Secure Webhook Listener (Called by PalPluss when user pays)
app.post('/api/palpluss-webhook', async (req, res) => {
    const event = req.body;
    console.log("Webhook received:", event);

    res.status(200).json({ received: true });

    if (event && (event.event_type === 'transaction.success' || event.status === 'SUCCESS' || event.status === 'completed')) {
        const transaction = event.transaction || event;
        const userId = transaction.metadata?.userId || transaction.userId;
        const amountPaid = Number(transaction.amount);

        if (userId && amountPaid > 0) {
            const userRef = db.ref('users/' + userId);
            await userRef.transaction((currentData) => {
                if (currentData) {
                    currentData.balance = (currentData.balance || 0) + amountPaid;
                }
                return currentData;
            });
            console.log(`Successfully credited Ksh ${amountPaid} to user ID: ${userId}`);
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
