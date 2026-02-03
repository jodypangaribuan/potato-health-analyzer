FROM node:18-alpine

WORKDIR /app

# Install dependencies based on specific package.json
COPY package.json package-lock.json* ./

RUN npm install

# Copy application code
COPY . .

# Build the Next.js application
RUN npm run build

# Expose port
EXPOSE 22444

# Start the application in production mode
# Note: Next.js by default runs on 3000, we need to pass port via -p
CMD ["npm", "start", "--", "-p", "22444"]
