import { useState } from 'react';
import LandingCard from '../components/LandingCard';
import './Landing.css'
import ExoraLogo from '../assets/logo.png';
import { Link } from 'react-router-dom';

const Landing = () => {
    const [cardContent] = useState([
        {
            icon: 'fa-solid fa-satellite',
            title: "NASA-Grade Data",
            description: "Access real-time satellite observations from POWER, GPM, IMERG, and MERRA-2"
        },
        {
            icon: 'fa-chart-line',
            title: "Probability Forecasts",
            description: "Get accurate probability predictions for rain, temperature, wind, and more"
        },
        {
            icon: 'fa-map-marked-alt',
            title: "Interactive Maps",
            description: "Visualize weather patterns with location search, pin drops, and area selection"
        }
    ]);
    return (
        <section className="flex justify-center items-start">
            <div className="container w-full max-w-screen-xl px-4 text-center">
                <header className=" pb-16 flex flex-col items-center">
                    <img src={ExoraLogo} alt="Exora Logo" className='h-60'/>
                    <h1 className="text-6xl -mt-23 mb-3 text-[#e6edf3] font-extrabold">Exora</h1>
                    <p className="tagline text-lg text-[#8b949e] mb-10 max-w-xl leading-relaxed">Plan your outdoor events with confidence, powered by NASA Earth Data</p>
                    <Link to={'/dashboard'} className="bg-[#4dc2f5] hover:bg-[#2a9cd2] text-white py-4 px-8 rounded-lg text-lg font-bold transition-all duration-300 inline-block btn-shadow hover:-translate-y-1">Launch Dashboard &rarr;</Link>
                </header>

                {/* Updated Feature Cards section */}
                <section className="flex flex-wrap gap-4 justify-center pb-20">
                    {cardContent.map((card, index) => (
                        <div key={index} className="w-full sm:w-1/2 md:w-1/3 max-w-[380px]">
                            <LandingCard
                                title={card.title}
                                description={card.description}
                                icon={card.icon}
                            />
                        </div>
                    ))}
                </section>
            </div>
        </section>
    )
}

export default Landing