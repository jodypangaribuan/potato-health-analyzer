/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://backend:22555/api/:path*',
            },
            {
                source: '/media/:path*',
                destination: 'http://backend:22555/media/:path*',
            },
        ]
    },
};

export default nextConfig;
