require('dotenv').config();
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const { ndown } = require("nayan-video-downloader")

const session = require("express-session");
const passport = require("passport");
const mongoose = require("mongoose");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const Razorpay = require('razorpay');
const crypto = require('crypto');
const bodyParser = require('body-parser');

const razorpay = new Razorpay({
  key_id: process.env.RZR_ID,        
  key_secret: process.env.RZR_SECRET 
});



app.use(express.static("public"));
app.use(bodyParser.json());

app.set("view engine", "ejs");

app.use(
    session({
      secret: "our little secret.",
      resave: false,
      saveUninitialized: true,
      cookie: {
      secure: false,
      maxAge: 6000000             
    }
    })
  );
  
  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Connect to MongoDB
  mongoose.connect(process.env.DB_ID);
  
  // Define User Schema and Model
  const userSchema = new mongoose.Schema({
    email: String,
    googleId: String,
    premium : Boolean
  });
  
  const User = mongoose.model("User", userSchema);
  
  // Configure Passport.js with Google OAuth
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        callbackURL: "https://igsaver.onrender.com/auth/google/redirect", // Ensure this matches Google Cloud Console
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const existingUser = await User.findOne({ googleId: profile.id });
          if (existingUser) return done(null, existingUser);
  
          const newUser = new User({
            email: profile.emails[0].value,
            googleId: profile.id,
            premium : false
          });
          await newUser.save();
          done(null, newUser);
        } catch (err) {
          done(err);
        }
      }
    )
  );
  
  // Serialize and Deserialize User for Session Handling
  passport.serializeUser((user, done) => {
    done(null, user.id , user.premium);
  });
  
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect("/auth/google");
  }



app.get("/auth/google", passport.authenticate("google", { scope: ["email", "profile"] }));
app.get(
    "/auth/google/redirect",
    passport.authenticate("google", { failureRedirect: "/auth/google" }),
    (req, res) => {
      res.redirect("/");
    }
  );

  app.get("/", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/login");
    }
    if(req.user.premium){
      res.redirect("/pro")
    }else{
      res.render("index");
    }
  });

  app.get("/premium", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/login");
    }
    res.render("premium");
  });


  app.get("/index", ensureAuthenticated, async (req, res) => {
    res.render("index");
  });

  app.get("/login", async (req, res) => {
    res.render("login");
  });

app.get("/download", async function (req, res) {

    const links = await ndown(req.query.url);

    console.log(links.data[0].url);

    res.render("download", { url: links.data[0].url, video: req.query.url });
});

app.get("/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Error during logout:", err);
        return res.status(500).send("An error occurred while logging out.");
      }
      req.session.destroy(() => {
        res.redirect("/");
      });
    });
  });

  app.get("/pro" , ensureAuthenticated , (req,res) => {
        res.render("pro")
  })


  app.get('/buy-premium', async (req, res) => {
    try {
      // Create an order for ₹49
      const order = await razorpay.orders.create({
        amount: 4900, // ₹49 in paise
        currency: 'INR',
        receipt: 'receipt#1', // Dynamic receipt ID
      });
  
      // Serve the Razorpay Checkout page
      const paymentPage = `
        <!DOCTYPE html>
        <html>
        <head>
          <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        </head>
        <body>
          <h2>Pay ₹49 to Buy Premium</h2>
          <script>
            const options = {
              key: '${razorpay.key_id}', // Razorpay Key ID
              amount: '${order.amount}', // Amount in paise
              currency: 'INR',
              order_id: '${order.id}', // Order ID created in backend
              name: 'Premium Subscription',
              description: '₹49 Payment for Premium',
              handler: async function (response) {
                const result = await fetch('/verify-payment', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(response),
                });
                const data = await result.json();
                if (data.status === 'success') {
                   window.location.href = '/pro';
                } else {
                  alert('Payment verification failed. Please try again.');
                }
              },
            };
            const rzp = new Razorpay(options);
            rzp.open();
          </script>
        </body>
        </html>
      `;
      res.send(paymentPage);
    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      res.status(500).send('Failed to initiate payment');
    }
  });

  app.post('/verify-payment', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = req.body;
  
    try {
      // Verify the Razorpay signature
      const generated_signature = crypto
        .createHmac('sha256', razorpay.key_secret)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');
  
      if (generated_signature !== razorpay_signature) {
        return res.status(400).json({ status: 'failure', message: 'Payment verification failed' });
      }
  
      // Update the user's premium status in MongoDB
      await User.findByIdAndUpdate(req.session.passport.user, { premium: true });
      // Respond with success
      res.json({ status: 'success', message: 'Payment verified successfully' });
    } catch (error) {
      console.error('Error during payment verification:', error);
      res.status(500).json({ status: 'failure', message: 'Internal server error' });
    }
  });


app.listen(port, function () {
    console.log("Server is running ");
});


