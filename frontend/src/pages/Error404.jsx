import { Link } from "react-router-dom"

export const Error404 = () => {
  return (
    <section className="flex items-center justify-center min-h-screen bg-[#0d1117] text-[#e6edf3]">
      <div className="container max-w-screen-xl px-4 text-center">
        <div className="py-20">
          <h1 className="text-9xl font-extrabold text-[#30363d] leading-none mb-4">
            404
          </h1>
          <h2 className="text-4xl font-bold text-[#e6edf3] mb-4">
            Page Not Found
          </h2>
          <p className="text-lg text-[#8b949e] mb-10 max-w-xl mx-auto leading-relaxed">
            Oops! The page you are looking for does not exist. It might have been moved or deleted.
          </p>
          
          <Link
            to="/"
            className="bg-[#4dc2f5] hover:bg-[#2a9cd2] text-white py-4 px-8 rounded-lg text-lg font-bold transition-all duration-300 inline-block btn-shadow hover:-translate-y-1"
          >
            <i className="fas fa-home mr-2"></i> Go to Homepage
          </Link>
        </div>
      </div>
    </section>
  )
}
