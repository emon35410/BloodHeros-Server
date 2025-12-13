const express = require('express')
const cors = require('cors')
const app = express()
const port = process.env.PORT || 3000
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb'); // Added ObjectId

// middleware
app.use(express.json());
app.use(cors());

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
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const db = client.db('bloodheros_db');
        const donorsCollection = db.collection('donors');
        const donorRequestCollection = db.collection('donorRequest');

        // Donors API
        app.get('/donors', async (req, res) => {
            const cursor = donorsCollection.find();
            const result = await cursor.toArray();
            res.send(result)
        })

        app.post('/donors', async (req, res) => {
            const newDonor = req.body;
            const result = await donorsCollection.insertOne(newDonor);
            res.send(result)
        })

        // Donor Request API

        // GET - Get all or filtered donor requests
        app.get('/donorRequest', async (req, res) => {
            try {
                const query = {};
                const { email } = req.query;
                if (email) {
                    query.requesterEmail = email;
                }
                const cursor = donorRequestCollection.find(query).sort({ _id: -1 });
                const result = await cursor.toArray();
                res.send(result)
            } catch (error) {
                console.error('Get requests error:', error);
                res.status(500).send({ message: 'Failed to fetch requests' });
            }
        })

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