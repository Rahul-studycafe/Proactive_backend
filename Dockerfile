# 1. Start with a lightweight Linux image that has Node.js 20 installed
FROM node:22-alpine

# 2. Create a working directory inside the container called '/app'
WORKDIR /app

# 3. Copy ONLY the package files first
# (This is a Docker trick to make future builds much faster)
COPY package*.json ./

# 4. Install the Node modules INSIDE the container
RUN npm install

# 5. Copy the rest of your backend source code into the container
COPY . .

# 6. Expose the port your backend uses (5000)
EXPOSE 5000

# 7. The command to start your application
CMD ["npm", "run", "dev"]