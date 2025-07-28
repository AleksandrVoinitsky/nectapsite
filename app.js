// Конфигурация Tailwind
tailwind.config = {
    theme: {
        extend: {
            colors: {
                telegram: {
                    bg: '#17212b',
                    surface: '#1f2c3a',
                    primary: '#5288c1',
                    primary_hover: '#5d93d1',
                    text: '#f5f5f5',
                    secondary_text: '#a8b5c1',
                    divider: '#2b3a4a',
                    accent: '#6ab3f3',
                    success: '#5cb85c',
                    error: '#ef4444'
                }
            },
            boxShadow: {
                'telegram': '0 2px 12px rgba(0, 0, 0, 0.2)'
            }
        }
    }
}

// Основное приложение Alpine.js
function app() {
    return {
        activeTab: 'shop',
        products: [],
        filteredProducts: [],
        visibleProducts: [],
        loading: true,
        cart: [],
        searchQuery: '',
        deliveryDate: 'today',
        customDate: '',
        orderComment: '',
        productsPerPage: 20,
        currentPage: 1,
        searchActive: false,
        categories: [],
        loadingCategories: true,
        currentCategory: null,
        filteredCategoryProducts: [],
        
        async init() {
            try {
                // Загрузка товаров
                const productsResponse = await fetch('products.json');
                if (!productsResponse.ok) throw new Error('Failed to load products');
                this.products = await productsResponse.json();
                
                // Фильтрация скрытых товаров и обработка изображений
                this.products = this.products
                    .filter(product => !product.hidden)
                    .map(product => {
                        // Добавляем article если его нет (для обратной совместимости)
                        if (!product.article) {
                            product.article = product.id.toString().padStart(6, '0');
                        }
                        
                        // Добавляем byWeight если нет (по умолчанию false)
                        if (typeof product.byWeight === 'undefined') {
                            product.byWeight = false;
                        }
                        
                        // Устанавливаем minQuantity в зависимости от byWeight
                        if (typeof product.minQuantity === 'undefined') {
                            product.minQuantity = product.byWeight ? 0.1 : 1;
                        }
                        
                        // Обработка изображений
                        if (product.image && !product.image.endsWith('.webp')) {
                            product.image = product.image.replace(/\.[^/.]+$/, '.webp');
                        }
                        
                        return product;
                    });
                
                this.filteredProducts = [...this.products];
                this.updateVisibleProducts();
                
                // Загрузка категорий
                const categoriesResponse = await fetch('categories.json');
                if (!categoriesResponse.ok) throw new Error('Failed to load categories');
                this.categories = await categoriesResponse.json();
                
                // Обработка изображений для категорий
                this.categories = this.categories.map(category => {
                    if (category.image && !category.image.endsWith('.webp')) {
                        category.image = category.image.replace(/\.[^/.]+$/, '.webp');
                    }
                    return category;
                });
                
            } catch (error) {
                console.error('Error loading data:', error);
                this.products = [];
                this.filteredProducts = [];
                this.visibleProducts = [];
                this.categories = [];
            } finally {
                this.loading = false;
                this.loadingCategories = false;
            }
            
            // Загрузка корзины из localStorage
            const savedCart = localStorage.getItem('cart');
            if (savedCart) {
                try {
                    this.cart = JSON.parse(savedCart);
                    // Проверяем, что товары из корзины существуют
                    this.cart = this.cart.filter(item => 
                        this.products.some(product => product.id === item.id)
                    );
                } catch (e) {
                    console.error('Error parsing cart data', e);
                    this.cart = [];
                }
            }
            
            // Инициализация даты (завтрашняя дата по умолчанию)
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            this.customDate = tomorrow.toISOString().split('T')[0];
            
            // Развертывание WebApp в Telegram
            if (window.Telegram?.WebApp) {
                Telegram.WebApp.expand();
            }
        },
        
        get hasMoreProducts() {
            return this.visibleProducts.length < this.filteredProducts.length;
        },
        
        updateVisibleProducts() {
            this.visibleProducts = this.filteredProducts.slice(0, this.currentPage * this.productsPerPage);
        },
        
        loadMoreProducts() {
            this.currentPage++;
            this.updateVisibleProducts();
        },
        
        searchProducts() {
            if (!this.searchQuery) {
                this.filteredProducts = [...this.products];
            } else {
                const query = this.searchQuery.toLowerCase().trim();
                this.filteredProducts = this.products.filter(p => 
                    p.name.toLowerCase().includes(query) || 
                    (p.description && p.description.toLowerCase().includes(query)) ||
                    (p.category && p.category.toLowerCase().includes(query))
                );
            }
            this.currentPage = 1;
            this.updateVisibleProducts();
        },
        
        selectCategory(category) {
            this.currentCategory = category;
            this.filteredCategoryProducts = this.products.filter(
                p => p.category === category.key
            );
            this.activeTab = 'category-products';
        },
        
        getProductById(id) {
            return this.products.find(p => p.id === id) || { 
                id: 0, 
                name: 'Товар удалён', 
                description: '',
                price: 0, 
                image: 'images/noimage.webp',
                category: ''
            };
        },
        
        getProductCount(id) {
            const item = this.cart.find(item => item.id === id);
            return item ? item.quantity : 0;
        },
        
        incrementCart(id) {
            const item = this.cart.find(item => item.id === id);
            item ? item.quantity++ : this.cart.push({ id, quantity: 1 });
            this.saveCart();
        },
        
        decrementCart(id) {
            const itemIndex = this.cart.findIndex(item => item.id === id);
            if (itemIndex === -1) return;
            
            if (this.cart[itemIndex].quantity > 1) {
                this.cart[itemIndex].quantity--;
            } else {
                this.cart.splice(itemIndex, 1);
            }
            this.saveCart();
        },
        
        removeFromCart(id) {
            this.cart = this.cart.filter(item => item.id !== id);
            this.saveCart();
        },

        // Обновляем шаг изменения количества в зависимости от типа товара
        getProductStep(id) {
            const product = this.getProductById(id);
            return product.byWeight ? 0.1 : 1;
        },
        
        // Обновляем методы работы с корзиной для учета minQuantity
        updateCartQuantity(id, quantity) {
            const product = this.getProductById(id);
            quantity = parseFloat(quantity);
            
            if (isNaN(quantity)) return;
            
            // Проверяем минимальное количество
            if (quantity < product.minQuantity) {
                quantity = product.minQuantity;
            }
            
            const itemIndex = this.cart.findIndex(item => item.id === id);
            
            if (quantity <= 0) {
                if (itemIndex !== -1) this.cart.splice(itemIndex, 1);
            } else {
                if (itemIndex !== -1) {
                    this.cart[itemIndex].quantity = quantity;
                } else {
                    this.cart.push({ id, quantity });
                }
            }
            this.saveCart();
        },
        
        saveCart() {
            localStorage.setItem('cart', JSON.stringify(this.cart));
        },
        
        get totalAmount() {
            return this.cart.reduce((total, item) => {
                const product = this.getProductById(item.id);
                return total + (product.price * item.quantity);
            }, 0);
        },

        // Обновляем метод processOrder для нового формата данных
        processOrder() {
            let selectedDate;
            switch(this.deliveryDate) {
                case 'today': selectedDate = 'Сегодня'; break;
                case 'tomorrow': selectedDate = 'Завтра'; break;
                case 'custom': selectedDate = this.customDate; break;
                default: selectedDate = 'Не указана';
            }
            
            // Формируем строку с артикулами и количествами
            const itemsString = this.cart.map(item => {
                const product = this.getProductById(item.id);
                return `${product.article} ${item.quantity}`;
            }).join(',');
            
            const orderData = {
                delivery_date: selectedDate,
                amount: this.totalAmount.toFixed(2),
                items: itemsString,  // Теперь это строка в формате "100001 2,100002 1"
                comment: this.orderComment,
                timestamp: new Date().toISOString()
            };
            
            if (window.Telegram?.WebApp) {
                Telegram.WebApp.sendData(JSON.stringify(orderData));
                Telegram.WebApp.close();
            } else {
                alert('Заказ оформлен! Данные: ' + itemsString);
            }
            
            this.cart = [];
            this.saveCart();
        }
    }
}