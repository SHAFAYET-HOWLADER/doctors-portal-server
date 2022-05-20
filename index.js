const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;
const cors = require('cors');
require('dotenv').config();
//------------->middleware<-------------//
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
    res.send("Backend server is started");
})
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rqvup.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
function verifyJwt(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden' })
        }
        res.decoded = decoded;
        next();
    });
}
async function run() {
    try {
        await client.connect()
        const dentalCollection = client.db("dentalServer").collection("service");
        const bookingCollection = client.db("dentalServer").collection("booking");
        const userCollection = client.db("dentalServer").collection("user");
        app.get('/user', verifyJwt, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })
        //--------------get all data from db---------------//
        app.put('/user/admin/:email', verifyJwt, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            console.log(requester)
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: {
                        role: 'admin'
                    },
                }
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else{
                return res.status(403).send({message: 'unAuthorized'})
            }

        })
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const accessToken = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1d'
            })
            res.send({ result, accessToken });
        })
        //--------------put user data in db---------------//
        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = dentalCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })
        app.get('/booking', verifyJwt, async (req, res) => {
            const patient = req.query.email;
            const decodedEmail = req.decoded?.email;
            if (patient === decodedEmail) {
                const query = { patient: patient }
                const result = await bookingCollection.find(query).toArray();
                return res.send(result);
            }
        })
        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 15, 2022';
            //step 1 : get all service date
            const services = await dentalCollection.find().toArray();
            //step 2 : get the booking of the day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();
            //step 3 : for each service, find booking for that service
            services.forEach(service => {
                const serviceBookings = bookings.filter(book => book.treatmentName === service.name);
                const bookedSlots = serviceBookings.map(book => book.slot);
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                service.slots = available;
            })
            res.send(services);
        })
        //---------------->insert single data in new collection<----------------//
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = {
                treatmentName: booking.treatmentName,
                date: booking.date,
                patient: booking.userName
            }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists });
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        })
    }
    finally {
        //   await client.close();
    }
}
run().catch(console.dir)
app.listen(port, () => {
    console.log('server running', port);
})