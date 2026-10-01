const express = require('express');
const admin = require('firebase-admin');

// Initialize Firebase Admin with your downloaded service account key
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://codm-19d8b-default-rtdb.firebaseio.com/" // Your Firebase database URL
});

const db = admin.database();
const app = express();
app.use(express.json());

// 1. Payment Initiation Route (Called when user clicks Ksh 20 or Ksh 100)
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
                accountReference: accountReference
            })
        });

        const result = await response.json();

        if (response.ok) {
            return res.json({ success: true, message: 'STK push sent', data: result });
        } else {
            return res.status(response.status).json({ success: false, error: result.message || 'Failed' });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Webhook Route (Called securely by PalPluss only when payment succeeds)
app.post('/api/palpluss-webhook', async (req, res) => {
    const event = req.body;

    if (event && (event.status === 'SUCCESS' || event.status === 'completed')) {
        const userId = event.metadata?.userId || event.userId;
        const amountPaid = Number(event.amount);

        if (userId && amountPaid > 0) {
            const userRef = db.ref('users/' + userId);
            await userRef.transaction((currentData) => {
                if (currentData) {
                    currentData.balance = (currentData.balance || 0) + amountPaid;
                }
                return currentData;
            });
        }
    }

    return res.status(200).json({ received: true });
});

// Use Render's dynamic port or default to 3000 locally
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});