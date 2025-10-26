# FIG Webapp

A modern, cyberpunk-styled web application built with Next.js 15, featuring Web3 integration, distributed testing capabilities, and advanced encryption tools. The app provides a sleek terminal-inspired interface with glassmorphism design elements and real-time WebSocket communication.

## 🚀 Features

### Core Functionality
- **Distributed Testing Sandbox**: Multi-browser testing environment with WebSocket-based communication
- **Data Encryption Tool**: Asymmetric encryption using RSA-OAEP with hybrid AES support
- **Credit Shop**: Ethereum-based payment system with ERC20 token minting
- **Web3 Authentication**: MetaMask integration with Nitrolite protocol
- **Real-time Communication**: WebSocket-based messaging system

### UI/UX Features
- **Cyberpunk Aesthetic**: Terminal-inspired background with glitch effects
- **Glassmorphism Design**: Modern glass-like UI components with backdrop blur
- **Responsive Layout**: Mobile-first design with adaptive components
- **Interactive Elements**: Hover effects, animations, and smooth transitions
- **Platform Detection**: OS-specific icons and styling

## 🛠️ Tech Stack

### Frontend
- **Next.js 15.5.6** - React framework with App Router
- **React 19.1.0** - UI library
- **TypeScript 5** - Type safety
- **Tailwind CSS 4** - Utility-first CSS framework
- **Framer Motion 12.23.21** - Animation library
- **React Icons 5.5.0** - Icon components

### Web3 & Blockchain
- **Viem 2.32.0** - Ethereum library
- **@erc7824/nitrolite 0.4.0** - Nitrolite protocol integration
- **WebSocket (ws 8.18.3)** - Real-time communication

### 3D Graphics
- **OGL 1.0.11** - WebGL library for 3D terminal effects
- **Preact 10.26.9** - Lightweight React alternative for 3D components

## 📁 Project Structure

```
fig-webapp/
├── app/
│   ├── api/                    # API routes
│   │   ├── circuit-test/       # HTTP request testing
│   │   ├── circuit-test-ws/    # WebSocket-based testing
│   │   ├── claim/              # Token claiming system
│   │   └── nitrolite-transfer/ # Nitrolite transfers
│   ├── auth/                   # Authentication utilities
│   │   ├── lib/
│   │   │   ├── utils.ts        # Session management
│   │   │   └── websocket.ts    # WebSocket service
│   │   └── page.tsx            # Auth page
│   ├── components/             # Reusable UI components
│   │   ├── BackgroundTerminal.tsx
│   │   ├── FaultyTerminal.tsx
│   │   ├── GlassNavbar.tsx
│   │   ├── GlassSearchBox.tsx
│   │   ├── GlitchText.tsx
│   │   └── PixelCard.tsx
│   ├── encrypt/                # Encryption tool page
│   ├── sandbox/                # Testing sandbox page
│   ├── shop/                   # Credit shop page
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Home page
├── public/                     # Static assets
├── package.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm, yarn, or bun
- MetaMask browser extension
- Ethereum Sepolia testnet access

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd fig-webapp
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   bun install
   ```

3. **Environment Variables**
   Create a `.env.local` file with the following variables:
   ```env
   # Nitrolite WebSocket URL
   NEXT_PUBLIC_NITROLITE_WS_URL=wss://your-nitrolite-ws-url
   
   # Server private key for Nitrolite transfers
   PRIVATE_KEY=your-server-private-key
   
   # Token contract address for minting
   TOKEN_CONTRACT_ADDRESS=your-erc20-contract-address
   
   # Sepolia RPC URL
   SEPOLIA_RPC_URL=https://rpc.sepolia.org
   ```

4. **Run the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   bun dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📱 Pages & Features

### 🏠 Home Page (`/`)
- **Glitch Text Animation**: Cyberpunk-styled "FIG Search" title
- **Glass Search Box**: Interactive search interface with quick links
- **Terminal Background**: Animated 3D terminal with glitch effects
- **Platform Detection**: OS-specific download button

### 🔐 Authentication (`/auth`)
- **MetaMask Integration**: Wallet connection and authentication
- **Nitrolite Protocol**: Web3 authentication using Nitrolite
- **Session Management**: JWT-based session handling
- **Real-time Status**: WebSocket connection monitoring

### 🔒 Encryption Tool (`/encrypt`)
- **Asymmetric Encryption**: RSA-OAEP with 2048-bit keys
- **Hybrid Encryption**: AES-GCM for large data with RSA key wrapping
- **Public/Private Key**: Wallet address-based encryption
- **Real-time Processing**: Client-side encryption/decryption
- **Copy to Clipboard**: Easy data sharing

### 🧪 Testing Sandbox (`/sandbox`)
- **Distributed Testing**: Multi-browser request execution
- **WebSocket Communication**: Real-time message passing
- **Session Management**: App session creation and management
- **Request Execution**: HTTP GET/POST request testing
- **Live Monitoring**: Real-time WebSocket message display

### 🛒 Credit Shop (`/shop`)
- **Ethereum Payments**: Sepolia testnet integration
- **ERC20 Minting**: Automatic token minting after payment
- **Credit Packages**: 500, 1000, and 10000 credit options
- **Transaction Verification**: On-chain transaction validation
- **Success Notifications**: Real-time purchase confirmations

## 🔧 API Endpoints

### `/api/circuit-test`
- **Method**: POST
- **Purpose**: Execute HTTP requests via curl
- **Body**: `{ url, method, headers, body }`
- **Response**: Request execution results

### `/api/circuit-test-ws`
- **Method**: POST
- **Purpose**: WebSocket-based request execution
- **Body**: `{ wsMessageData, sessionId }`
- **Response**: WebSocket message processing results

### `/api/claim`
- **Method**: POST
- **Purpose**: Claim ERC20 tokens after payment
- **Body**: `{ txHash, address }`
- **Response**: Token minting confirmation

### `/api/nitrolite-transfer`
- **Method**: POST
- **Purpose**: Server-side Nitrolite transfers
- **Body**: `{ toAccount, amount, asset }`
- **Response**: Transfer initiation confirmation

## 🎨 UI Components

### BackgroundTerminal
- **3D Terminal Effect**: WebGL-powered terminal animation
- **Glitch Effects**: Cyberpunk-style visual effects
- **Mouse Interaction**: Responsive to mouse movement
- **Performance Optimized**: Memoized for smooth rendering

### GlitchText
- **CSS Animations**: Glitch effect with customizable speed
- **Shadow Effects**: Red/cyan shadow glitch effects
- **Hover Support**: Optional hover-triggered animations
- **Customizable**: Speed, shadows, and hover behavior

### GlassNavbar
- **Platform Detection**: OS-specific icons and styling
- **Glassmorphism**: Backdrop blur and transparency
- **Responsive Design**: Mobile-friendly navigation
- **Download Button**: Platform-aware download functionality

### GlassSearchBox
- **Quick Links**: Pre-configured external links
- **Search Interface**: Styled search input
- **Animation Support**: Smooth show/hide transitions
- **Icon Integration**: React Icons for external services

## 🔐 Security Features

### Encryption
- **RSA-OAEP**: Industry-standard asymmetric encryption
- **AES-GCM**: Authenticated encryption for large data
- **Key Management**: Secure key generation and storage
- **Client-side Processing**: No server-side key exposure

### Web3 Security
- **MetaMask Integration**: Secure wallet connection
- **Transaction Verification**: On-chain validation
- **Session Management**: JWT-based authentication
- **Private Key Protection**: Server-side key management

## 🌐 WebSocket Communication

### Real-time Features
- **Live Status Updates**: Connection state monitoring
- **Message Broadcasting**: Multi-client communication
- **Session Management**: App session lifecycle
- **Error Handling**: Robust error recovery

### Protocol Support
- **Nitrolite RPC**: Web3 protocol integration
- **Custom Messages**: Application-specific messaging
- **JSON Serialization**: Structured data exchange
- **Connection Pooling**: Efficient resource management

## 🚀 Deployment

### Production Build
```bash
npm run build
npm start
```

### Environment Setup
1. Configure environment variables
2. Set up Nitrolite WebSocket endpoint
3. Deploy ERC20 token contract
4. Configure server private key
5. Set up Sepolia RPC endpoint

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the API endpoints
- Test with Sepolia testnet

## 🔮 Future Enhancements

- **Mobile App**: React Native implementation
- **Advanced Testing**: Load testing capabilities
- **Analytics Dashboard**: Usage statistics and monitoring
- **Multi-chain Support**: Additional blockchain networks
- **Enhanced Security**: Additional encryption algorithms
- **Performance Optimization**: Caching and optimization

---

Built with ❤️ using Next.js, React, and Web3 technologies.