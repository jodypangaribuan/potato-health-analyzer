/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        return [
            {
                source: '/api/results/:path*',
                destination: 'http://backend:22555/api/results/:path*',
            },
            {
                source: '/media/:path*',
                destination: 'http://backend:22555/media/:path*',
            },
        ]
    },
};

export default nextConfig;
