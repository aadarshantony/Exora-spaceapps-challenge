const LandingCard = ({ title, description, icon }) => {
    return (
        <div className="feature-card bg-[#161b22] border border-[#30363d] rounded-xl min-h-[250px] p-8 max-w-[380px] w-full text-left flex flex-col items-start transition-all duration-300 hover:-translate-y-1 card-shadow-hover">
            <div className="icon-container w-12 h-12 bg-gradient-to-br from-[#b882fa] to-[#825ad7] rounded-xl mb-5 flex justify-center items-center shadow-glow-purple">
                <i className={`fas ${icon} text-2xl text-[#f0f0f0]`}></i>
            </div>
            <h3 className="text-xl font-semibold mb-3 text-[#e6edf3] min-h-[28px]">{title}</h3>
            <p className="text-base text-[#8b949e] leading-relaxed min-h-[64px]">{description}</p>
        </div>
    );
};

export default LandingCard;