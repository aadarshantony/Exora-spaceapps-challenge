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
                toastOptions={{
                    style: {
                        background: '#161b22',
                        color: '#e6edf3',
                        border: '1px solid #30363d',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    },
                    success: {
                        iconTheme: {
                            primary: '#4dc2f5',
                            secondary: '#161b22',
                        },
                        style: {
                            border: '1px solid #36c891',
                        },
                    },
                    error: {
                        iconTheme: {
                            primary: '#f75555',
                            secondary: '#161b22',
                        },
                        style: {
                            border: '1px solid #f75555',
                        },
                    },
                    loading: {
                        iconTheme: {
                            primary: '#4dc2f5',
                            secondary: '#161b22',
                        },
                    },
                }}
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