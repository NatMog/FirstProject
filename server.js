const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = 80;

// Настройка подключения к базе данных
const conn = mysql.createPool({
    connectionLimit: 5,
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1111',
    database: process.env.DB_NAME || 'test',
    port: Number(process.env.DB_PORT) || 3306
});


// Middleware для парсинга JSON
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/images', express.static(__dirname + '/images'));

//*******************************************************/
//Использование сессий
app.use(session({
  secret: '1234', // обязательно замените на свой секрет
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // для http, для https — true
}));


function checkAuth(req, res, next) {
  if (req.session.user) { //сессия пользователя открыта на данный момент (то есть пользователь на сайте под своим логином и паролем)
    next();
  console.log(req.session.user)
  } 
  else {
    res.redirect('/');
    console.log(req.session.user) //если пользователь не авторизирован/ вышел из аккаунта, 
    //то происходит редирект на первую страницу
  }
}
//*******************************************************/

//ПЕРВАЯ СТРАНИЦА
app.get("/", (req, res) =>
{
    res.sendFile(__dirname + "/one.html");
});

//ВТОРАЯ СТРАНИЦА
app.get("/katalog", checkAuth, (req, res) =>
{
    res.sendFile(__dirname + "/two.html");
});


//РЕГИСТРАЦИЯ
app.post("/reg", (req, res) => {
  // Если форма отправляет JSON или обычные form-поля, берём данные из body.
  const { email, password } = req.query;

  if (!email || !password) {
    return res.status(400).json({ message: "Введите email и пароль" });
  }

  conn.query(
    "SELECT id FROM users WHERE email = ?",
    [email],
    (err, results) => {
      if (err) {
        console.error("Ошибка проверки email:", err);
        return res.status(500).json({ message: "Ошибка базы данных" });
      }

      if (results.length > 0) {
        return res.status(409).json({
          message: "Этот логин/email уже занят"
        });
      }

      bcrypt.hash(password, 10, (err, hashPassword) => {
        if (err) {
          console.error("Ошибка хэширования:", err);
          return res.status(500).json({ message: "Ошибка хэширования пароля" });
        }

        conn.query(
          "INSERT INTO users (email, password) VALUES (?, ?)",
          [email, hashPassword],
          (err, result) => {
            if (err) {
              console.error("Ошибка добавления пользователя:", err);
              return res.status(500).json({ message: "Не удалось создать пользователя" });
            }

            req.session.user = {
              id: result.insertId,
              email
            };

            return res.json({
              message: "Вы успешно зарегистрировались",
              redirect: "/katalog"
            });
          }
        );
      });
    }
  );
});

//АВТОРИЗАЦИЯ
app.post("/avt", (req, res) => {
  const email = req.body.email;
  const password = req.body.password;


  conn.query("SELECT * FROM users WHERE email = ?", [email], (err, result) => {
    if (err) {res.send({message:"Ошибка в текст запроса SQL/Ошибка в подключении к БД"})}

    if (result.length > 0) {
      //забираем нулевую строку из результата запроса
      const user = result[0];
      //забираем у этого пользователя зашифрованный пароль
      const hashPassword = user.password;
      //расшифровываем пароль
      bcrypt.compare(password, hashPassword, (err, isMatch) => {
        if (err) {res.send({message:"не получается расшифровать"})}
        if (isMatch)
        {
          req.session.user = {id: user.id, email: email, password: password}
          res.send({message:"Вы успешно авторизировались", redirect:"/katalog"})
        }
      })
    } 
    else {res.send({message:"Вы ввели некорректный логин ИЛИ пароль"})}
  })
})


//ОТОБРАЖЕНИЕ ТАБЛИЦЫ PRODUCTS
app.get("/cakes", (req, res) => {
  conn.query("SELECT id_p, name_cake, weight, description, time, image_path, price FROM products", (err, results) => {
      if (err) {return res.status(500).json({ message: "Ошибка запроса к БД" });}
      res.json(results);
    }
  );
});

//ВЫХОД ИЗ АККАУНТА
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Ошибка выхода');
    }
    else
    res.redirect('/'); // или другой URL
  });
});


//добавление в корзину
app.post('/addToCart', checkAuth, (req, res) => {
    
    const id_p = parseInt(req.body.id_p); // Преобразуем в число id торта, забираем из клиентской части из функции fetch
    const id_u = req.session.user.id; //id юзера мы забираем из сессии

    console.log(id_p);
    console.log(id_u);

    // Добавление товара в корзину
    //Первый запрос - проверка есть или нет данный товар у конкретного покупателя в корзине
    conn.query('SELECT * FROM carts WHERE id_p = ? and id_u = ?', [id_p, id_u], (err, results) => {
        if (err) {
            console.error("Ошибка базы данных1:", err); // Логируем ошибку
            return res.status(500).json({ message: 'Ошибка базы данных1' });
        }

        //если у данного пользователя этот торт уже есть в коризне, то мы просто увеличиваем кол-во этого товара на +1
        if (results.length > 0) {
            // Запрос на редактирование строки таблицы - Увеличиваем количество товара (торта)
            conn.query('UPDATE carts SET quantity = quantity + 1 WHERE id_p = ? and id_u = ?', [id_p, id_u], (err) => {
                if (err) {
                    console.error("Ошибка обновления корзины:", err); // Логируем ошибку
                    return res.status(500).json({ message: 'Ошибка базы данных2' });
                }
                res.json({ message: 'Товар добавлен в корзину' });
            });
        } 
        else {
            //Если такого товра у данного пользователя в корзине еще не было -  Добавляем новую запись в таблицу carts
            conn.query('INSERT INTO carts (id_p, quantity, id_u) VALUES (?, ?, ?)', [id_p, 1, id_u], (err) => {
                if (err) {
                    console.error("Ошибка добавления в корзину:", err); // Логируем ошибку
                    return res.status(500).json({ message: 'Ошибка базы данных3' });
                }
                res.json({ message: 'Товар добавлен в корзину' });
            });
        }
    });
});

//отображение корзины из БД 
app.get('/showCart', checkAuth, (req,res) =>{
  
  const userId = req.session.user.id;

  conn.query("SELECT products.name_cake, products.price, carts.quantity FROM carts JOIN products ON carts.id_p = products.id_p WHERE carts.id_u = ?", [userId],  (err, results) => {
      if (err) return res.status(500).json({ message: 'Ошибка базы данных4' });
      res.json(results);
    }
  );
})


app.post('/updateCartQuantity', checkAuth, (req, res) => {


  const userId = req.session.user.id;
  const { id_p, quantity } = req.body;


  const productId = Number(id_p);
  const newQuantity = Number(quantity);

  if (newQuantity <= 0) {
    return conn.query('DELETE FROM carts WHERE id_u = ? AND id_p = ?',[userId, productId], err => {
        if (err) return res.status(500).json({ message: 'Ошибка базы данных' });
        res.json({ message: 'Товар удалён из корзины' });
      }
    );
  }

  conn.query('UPDATE carts SET quantity = ? WHERE id_u = ? AND id_p = ?',[newQuantity, userId, productId], err => {
      if (err) return res.status(500).json({ message: 'Ошибка базы данных' });
      res.json({ message: 'Количество обновлено' });
    }
  );
});

// Запуск сервера
app.listen(PORT, () => {console.log(`Сервер запущен на http://localhost:${PORT}`)})