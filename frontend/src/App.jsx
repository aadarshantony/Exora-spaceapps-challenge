import { Route, BrowserRouter as Router, Routes } from "react-router-dom"
import Landing from "./pages/Landing"
import { Toaster } from "react-hot-toast"
import Footer from "./components/Footer"
import WeatherPredictor from "./pages/WeatherPredictor"
import { Error404 } from "./pages/Error404"
import { Analytics } from "@vercel/analytics/react"

const App = () => {
    return (
        <Router>
            <Toaster
                position="bottom-right"
                reverseOrder={false}
            />
            <Analytics />
            <div className="bg-[#0d1117] text-[#e6edf3] flex flex-col min-h-screen">
                <main className="flex-grow">
                    <Routes>
                        <Route path="/" element={<Landing />} />
                        <Route path="/dashboard" element={<WeatherPredictor />} />
                        <Route path="*" element={<Error404 />} />
                    </Routes>
                </main>
                <Footer />
            </div>
        </Router>
    )
}

export default App