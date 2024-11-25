require('dotenv').config();
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const { ndown } = require("nayan-media-downloader")

const session = require("express-session");
const passport = require("passport");
const mongoose = require("mongoose");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");


app.use(express.static("public"));

app.set("view engine", "ejs");

app.use(
    session({
      secret: "our little secret.",
      resave: false,
      saveUninitialized: true,
      cookie: {
      secure: false,
      maxAge: 60000             
    }
    })
  );
  
  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Connect to MongoDB
  mongoose.connect("mongodb+srv://aniketkumarcrr:LAPfMmbkpDFbs9Qh@signin.rvlkj.mongodb.net/emailDB");
  
  // Define User Schema and Model
  const userSchema = new mongoose.Schema({
    email: String,
    googleId: String,
  });
  
  const User = mongoose.model("User", userSchema);
  
  // Configure Passport.js with Google OAuth
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        callbackURL: "http://localhost:3000/auth/google/redirect", // Ensure this matches Google Cloud Console
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const existingUser = await User.findOne({ googleId: profile.id });
          if (existingUser) return done(null, existingUser);
  
          const newUser = new User({
            email: profile.emails[0].value,
            googleId: profile.id,
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
    done(null, user.id);
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
      // Redirect to the download page after successful login
      res.redirect("/index");
    }
  );

  app.get("/", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/auth/google");
    }
    res.render("index");
  });


  app.get("/index", ensureAuthenticated, async (req, res) => {
    res.render("index");
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
        // Redirect to home or login page after logout
        res.redirect("/");
      });
    });
  });
  


app.listen(port, function () {
    console.log("Server is running ");
});




