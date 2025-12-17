const express = require('express')
const cors = require('cors')
const app = express()
const port = process.env.PORT || 3000
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_KEY);
const admin = require("firebase-admin");

const serviceAccount = require("./blood-heros-firebase-adminsdk.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const crypto = require('crypto');

function generateTrackingId(prefix = 'BH') {
    const date = new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, ''); // YYYYMMDD

    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    // 3 bytes → 6 hex chars

    return `${prefix}-${date}-${randomHex}`;
}




// middleware
app.use(express.json());
app.use(cors());
const verifyFBToken = async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).send({ message: "Unauthorizes Access" })
    }

    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        console.log("Decoded in the token", decoded)
        req.decoded_email = decoded.email;
        next();
    }
    catch (error) {
        return res.status(401).send({ message: "Unauthorized Access" })
    }

}
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@learndb.jowukka.mongodb.net/?appName=LearnDB`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        await client.connect();
        const db = client.db('bloodheros_db');
        const donorsCollection = db.collection('donors');
        const donorRequestCollection = db.collection('donorRequest');
        const donationsCollection = db.collection('donations');

        await donationsCollection.createIndex(
            { transactionId: 1 },
            { unique: true }
        );




        // Donors API
        app.post('/donors', async (req, res) => {
            try {
                const donor = req.body;

                if (!donor.email) {
                    return res.status(400).send({ message: 'Email is required' });
                }

                const existingDonor = await donorsCollection.findOne({ email: donor.email });
                if (existingDonor) {
                    return res.status(409).send({ message: 'Donor already exists' });
                }

                donor.role = 'donor';
                donor.status = 'active';
                donor.created_at = new Date();

                const result = await donorsCollection.insertOne(donor);
                res.send(result);

            } catch (error) {
                console.error('Create donor error:', error);
                res.status(500).send({ message: 'Failed to create donor' });
            }
        });



        app.get('/donors', async (req, res) => {
            const cursor = donorsCollection.find();
            const result = await cursor.toArray();
            res.send(result)
        })



        // Donor Request API

        app.get('/donorRequest', async (req, res) => {
            try {
                const query = {};
                const { email, limit } = req.query;

                if (email) {
                    query.requesterEmail = email;
                }

                let cursor = donorRequestCollection
                    .find(query)
                    .sort({ _id: -1 });

                // 🔥 apply limit ONLY if provided
                if (limit) {
                    cursor = cursor.limit(parseInt(limit));
                }

                const result = await cursor.toArray();
                res.send(result);

            } catch (error) {
                console.error('Get requests error:', error);
                res.status(500).send({ message: 'Failed to fetch requests' });
            }
        });

        // POST - Create new donor request
        app.post('/donorRequest', async (req, res) => {
            try {
                const newRequest = req.body;
                const result = await donorRequestCollection.insertOne(newRequest);
                res.send(result)
            } catch (error) {
                console.error('Create request error:', error);
                res.status(500).send({ message: 'Failed to create request' });
            }
        })

        // PATCH - Update donor request status
        app.patch('/donorRequest/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const updateData = req.body;

                const result = await donorRequestCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updateData }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: 'Request not found' });
                }

                res.send({
                    success: true,
                    message: 'Request updated successfully',
                    modifiedCount: result.modifiedCount
                });
            } catch (error) {
                console.error('Update request error:', error);
                res.status(500).send({ message: 'Failed to update request' });
            }
        })

        // DELETE - Delete donor request (hard delete)
        app.delete('/donorRequest/:id', async (req, res) => {
            try {
                const { id } = req.params;

                const result = await donorRequestCollection.deleteOne({
                    _id: new ObjectId(id)
                });

                if (result.deletedCount === 0) {
                    return res.status(404).send({ message: 'Request not found' });
                }

                res.send({
                    success: true,
                    message: 'Request deleted successfully',
                    deletedCount: result.deletedCount
                });
            } catch (error) {
                console.error('Delete request error:', error);
                res.status(500).send({ message: 'Failed to delete request' });
            }
        })

        // GET - Get single donor request by ID
        app.get('/donorRequest/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const result = await donorRequestCollection.findOne({
                    _id: new ObjectId(id)
                });

                if (!result) {
                    return res.status(404).send({ message: 'Request not found' });
                }

                res.send(result);
            } catch (error) {
                console.error('Get single request error:', error);
                res.status(500).send({ message: 'Failed to fetch request' });
            }
        })

        // Donation Payment API's

        // 1. Create checkout session
        app.post("/create-checkout-session", async (req, res) => {
            const { name, email, amount } = req.body;
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                line_items: [
                    {
                        price_data: {
                            currency: "usd",
                            product_data: {
                                name: "BloodHeros Donation",
                            },
                            unit_amount: parseInt(amount) * 100,
                        },
                        quantity: 1,
                    },
                ],
                customer_email: email,
                mode: "payment",
                success_url: `${process.env.DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,

                cancel_url: `${process.env.DOMAIN}/supportus`,
            });

            res.send({ url: session.url });
        });


        app.patch("/payment-success", async (req, res) => {
            const sessionID = req.query.session_id;

            if (!sessionID) {
                return res.status(400).send({
                    success: false,
                    message: "Session ID is required"
                });
            }

            try {
                const session = await stripe.checkout.sessions.retrieve(sessionID);
                const transactionId = session.payment_intent;

                // Check if payment already exists
                const paymentExist = await donationsCollection.findOne({
                    transactionId: transactionId
                });

                if (paymentExist) {
                    return res.send({
                        success: true,
                        message: "Already Exist",
                        transactionId,
                        donation: paymentExist
                    });
                }

                const donation = {
                    name: session.customer_details?.name || "Anonymous",
                    email: session.customer_email,
                    amount: session.amount_total / 100,
                    payment_status: session.payment_status,
                    trakingID: generateTrackingId(),
                    transactionId: session.payment_intent,
                    session_id: session.id,
                    created_at: new Date(),
                };

                const result = await donationsCollection.insertOne(donation);

                res.send({
                    success: true,
                    message: "Donation saved successfully",
                    donation,
                });

            } catch (error) {
                // Handle duplicate key error from MongoDB unique index
                if (error.code === 11000) {
                    // Fetch and return the existing donation
                    const existing = await donationsCollection.findOne({
                        transactionId: error.keyValue?.transactionId
                    });

                    return res.send({
                        success: true,
                        message: "Duplicate prevented by DB",
                        donation: existing
                    });
                }

                console.error("Payment success error:", error);
                res.status(500).send({
                    success: false,
                    message: "Failed to save donation",
                });
            }
        });




        app.get("/donations", verifyFBToken, async (req, res) => {

            console.log("Headers", req.headers)
            const email = req.query.email;
            const query = {}

            if (email) {
                query.email = email;
                if (email !== req.decoded_email)
                    return res.status(403).send({ message: "Forbidden Access" })
            }
            const donations = await donationsCollection
                .find(query)
                .sort({ created_at: -1 })
                .toArray();

            res.send(donations);
        });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('BloodHeros Is Donating Blood!')
})

app.listen(port, () => {
    console.log(`BloodHeros app listening on port ${port}`)
})