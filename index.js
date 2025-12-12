const express = require('express')
const cors = require('cors')
const app = express()
const port = process.env.PORT || 3000
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');

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

        // Donor Request API

        app.get('/donorRequest',async(req,res)=>{
            const cursor = donorRequestCollection.find();
            const result = await cursor.toArray();
            res.send(result)
        })

        app.post('/donorRequest',async(req,res)=>{
           const newRequest = req.body;
           const result = await donorRequestCollection.insertOne(newRequest);
           res.send(result)
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
    console.log(`Example app listening on port ${port}`)
})
