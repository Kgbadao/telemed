import { Link } from "react-router-dom";
import { Video, Search, MessageCircle, Monitor, Shield, Clock, DollarSign, AlertCircle, Heart, Brain, Baby, Stethoscope } from "lucide-react";
import doctorImage from "../assets/doctor-image.webp";

function HomePage() {
  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-blue-50 via-indigo-100 to-purple-100 text-gray-800">
      {/* Emergency Banner */}
      <div className="bg-red-600 text-white py-3 px-6 text-center">
        <div className="flex items-center justify-center gap-2 max-w-4xl mx-auto">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm md:text-base font-medium">
            <strong>Emergency?</strong> Call 911 immediately. This service is not for life-threatening emergencies.
          </p>
        </div>
      </div>

      {/* Hero Section */}
      <section className="flex flex-col-reverse md:flex-row items-center justify-between py-20 px-6 md:px-16 max-w-5xl mx-auto gap-12">
        <div className="flex-1 space-y-6 text-left">
          <h1 className="text-4xl md:text-5xl font-extrabold text-blue-900 leading-snug font-poppins">
            Welcome to <span className="text-indigo-600">TeleMed</span>
          </h1>
          <p className="text-lg text-gray-700 leading-relaxed font-rubik">
            Your health, simplified. Connect with healthcare professionals from the comfort of your home.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <Link
              to="/video-call"
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-full font-medium hover:scale-105 transition shadow-lg"
            >
              <Video className="w-5 h-5" /> Start Video Call
            </Link>
            <Link
              to="/chat"
              className="flex items-center gap-2 border-2 border-indigo-600 text-indigo-700 px-6 py-3 rounded-full font-medium hover:bg-indigo-50 hover:scale-105 transition"
            >
              <MessageCircle className="w-5 h-5" /> Message Now
            </Link>
          </div>
        </div>
        <div className="flex-1 flex justify-center md:justify-end">
          <div className="relative">
            {/* Decorative background shapes */}
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-2xl blur-2xl opacity-30"></div>
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-indigo-300 rounded-full opacity-50"></div>
            <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-purple-300 rounded-full opacity-40"></div>
            {/* Image with enhanced border */}
            <img 
              src={doctorImage} 
              alt="Doctor" 
              className="relative w-72 md:w-80 h-auto rounded-2xl shadow-2xl border-4 border-white" 
            />
          </div>
        </div>
      </section>

      {/* Specialty Categories */}
      <section className="py-16 px-6 md:px-12 bg-white bg-opacity-60">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-blue-900 mb-4 font-poppins">Browse by Specialty</h2>
          <p className="text-gray-600 mb-12 font-rubik">Find the right healthcare professional for your needs</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Link to="/doctors?specialty=general" className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl hover:scale-105 transition border border-indigo-100 group">
              <Stethoscope className="w-10 h-10 text-indigo-600 mx-auto mb-3 group-hover:scale-110 transition" />
              <h3 className="font-semibold text-gray-800">General Practice</h3>
            </Link>
            <Link to="/doctors?specialty=mental" className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl hover:scale-105 transition border border-indigo-100 group">
              <Brain className="w-10 h-10 text-purple-600 mx-auto mb-3 group-hover:scale-110 transition" />
              <h3 className="font-semibold text-gray-800">Mental Health</h3>
            </Link>
            <Link to="/doctors?specialty=cardiology" className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl hover:scale-105 transition border border-indigo-100 group">
              <Heart className="w-10 h-10 text-red-500 mx-auto mb-3 group-hover:scale-110 transition" />
              <h3 className="font-semibold text-gray-800">Cardiology</h3>
            </Link>
            <Link to="/doctors?specialty=pediatrics" className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl hover:scale-105 transition border border-indigo-100 group">
              <Baby className="w-10 h-10 text-pink-600 mx-auto mb-3 group-hover:scale-110 transition" />
              <h3 className="font-semibold text-gray-800">Pediatrics</h3>
            </Link>
          </div>
        </div>
      </section>

      {/* Features/Benefits Section */}
      <section className="py-20 px-6 md:px-12 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-blue-900 mb-4 font-poppins">Why Choose TeleMed?</h2>
          <p className="text-gray-600 mb-12 font-rubik">Healthcare made simple, secure, and accessible</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition space-y-4">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
                <Shield className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-blue-800 font-rubik">100% Secure</h3>
              <p className="text-gray-600">
                Built using industry-standard security protocols to ensure data confidentiality and integrity. Features end-to-end encryption and secure access controls.
              </p>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition space-y-4">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-blue-800 font-rubik">24/7 Availability</h3>
              <p className="text-gray-600">
                Connect with healthcare professionals anytime, anywhere. No more waiting rooms or scheduling conflicts.
              </p>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition space-y-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                <DollarSign className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-blue-800 font-rubik">Affordable Care</h3>
              <p className="text-gray-600">
                Save time and money with virtual consultations. Most insurance plans accepted, or pay as you go.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-24 px-6 md:px-12 bg-white bg-opacity-70">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-blue-900 mb-16 font-poppins">Our Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-md hover:scale-[1.02] transition-transform space-y-4 border border-indigo-200">
              <Search className="w-8 h-8 text-indigo-600" />
              <h3 className="text-xl font-semibold text-blue-800 font-rubik">Find a Doctor</h3>
              <p className="text-gray-700">
                Search our extensive network of qualified healthcare providers to find the right specialist for your needs.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-md hover:scale-[1.02] transition-transform space-y-4 border border-indigo-200">
              <MessageCircle className="w-8 h-8 text-indigo-600" />
              <h3 className="text-xl font-semibold text-blue-800 font-rubik">Instant Messaging</h3>
              <p className="text-gray-700">
                Communicate with your doctor securely and conveniently through our real-time messaging platform.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-md hover:scale-[1.02] transition-transform space-y-4 border border-indigo-200">
              <Monitor className="w-8 h-8 text-indigo-600" />
              <h3 className="text-xl font-semibold text-blue-800 font-rubik">Video Consultations</h3>
              <p className="text-gray-700">
                Schedule and conduct virtual appointments with healthcare professionals from anywhere in the world.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-indigo-900 text-indigo-100 text-center py-6">
        <p className="font-rubik text-sm tracking-wide">&copy; {new Date().getFullYear()} TeleMed. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default HomePage;