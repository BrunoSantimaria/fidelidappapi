const Account = require("../accounts/Account.model");
const logger = require("../logger/logger");
const { logAction } = require("../logger/logger");
const Client = require("../promotions/client.model");
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
exports.waiterController = {
  createWaiter: async (req, res) => {
    try {
      const { accountId } = req.params;
      const { name } = req.body;

      const account = await Account.findById(accountId);
      if (!account) {
        return res.status(404).json({ message: "Cuenta no encontrada" });
      }

      const waiterExists = account.landing.waiters.some((waiter) => waiter.name.toLowerCase() === name.toLowerCase());

      if (waiterExists) {
        return res.status(400).json({ message: "Ya existe un mesero con este nombre" });
      }

      account.landing.waiters.push({ name });
      await account.save();

      res.status(201).json({ message: "Mesero creado exitosamente", waiter: account.landing.waiters.slice(-1)[0] });
    } catch (error) {
      res.status(500).json({ message: "Error al crear mesero", error });
    }
  },

  getWaiter: async (req, res) => {
    try {
      const { accountId, waiterId } = req.params;
      const account = await Account.findById(accountId);
      if (!account) {
        return res.status(404).json({ message: "Cuenta no encontrada" });
      }
      const waiter = account.landing.waiters.id(waiterId);
      if (!waiter) {
        return res.status(404).json({ message: "Mesero no encontrado" });
      }
      res.json(waiter);
    } catch (error) {
      res.status(500).json({ message: "Error al obtener mesero", error });
    }
  },

  getWaiters: async (req, res) => {
    try {
      const { accountId } = req.params;
      const account = await Account.findById(accountId);
      if (!account) {
        return res.status(404).json({ message: "Cuenta no encontrada" });
      }
      res.json(account.landing.waiters);
    } catch (error) {
      res.status(500).json({ message: "Error al obtener meseros", error });
    }
  },

  updateWaiter: async (req, res) => {
    try {
      const { accountId, waiterId } = req.params;
      const { name, active } = req.body;

      const account = await Account.findById(accountId);
      if (!account) {
        return res.status(404).json({ message: "Cuenta no encontrada" });
      }

      const waiter = account.landing.waiters.id(waiterId);
      if (!waiter) {
        return res.status(404).json({ message: "Mesero no encontrado" });
      }

      if (name) waiter.name = name;
      if (typeof active === "boolean") waiter.active = active;

      await account.save();
      res.json({ message: "Mesero actualizado exitosamente", waiter });
    } catch (error) {
      res.status(500).json({ message: "Error al actualizar mesero", error });
    }
  },

  deleteWaiter: async (req, res) => {
    try {
      const { accountId, waiterId } = req.params;
      console.log("⭐ Iniciando eliminación de mesero:", { accountId, waiterId });

      const account = await Account.findById(accountId);
      console.log("📄 Cuenta encontrada:", !!account);

      if (!account) {
        console.log("❌ Cuenta no encontrada");
        return res.status(404).json({ message: "Cuenta no encontrada" });
      }

      account.landing.waiters.pull({ _id: waiterId });
      console.log("🗑️ Intentando guardar cambios...");

      await account.save();

      console.log("✅ Mesero eliminado exitosamente");
      res.json({ message: "Mesero eliminado exitosamente" });
    } catch (error) {
      console.log("❌ Error al eliminar mesero:", error);
      console.log("Stack:", error.stack);
      res.status(500).json({ message: "Error al eliminar mesero", error: error.message });
    }
  },

  addRating: async (req, res) => {
    try {
      const { accountId, waiterId } = req.params;
      const { rating, comment, clientId } = req.body;

      console.log("📝 Datos recibidos:", { rating, comment, clientId });

      const client = await Client.findById(clientId);
      console.log("👤 Datos del cliente:", {
        encontrado: !!client,
        nombre: client?.name,
        email: client?.email,
      });

      const account = await Account.findById(accountId);
      if (!account) {
        return res.status(404).json({ message: "Cuenta no encontrada" });
      }

      const waiter = account.landing.waiters.id(waiterId);
      if (!waiter) {
        return res.status(404).json({ message: "Mesero no encontrado" });
      }

      // Verificamos el objeto rating antes de guardarlo
      const ratingObject = {
        rating,
        comment,
        client: {
          name: client.name,
          email: client.email,
        },
        createdAt: new Date(),
      };

      console.log("💾 Objeto a guardar:", ratingObject);

      // Aseguramos que waiter.ratings existe
      if (!waiter.ratings) {
        waiter.ratings = [];
      }

      waiter.ratings.push(ratingObject);
      console.log("📊 Ratings después de agregar:", waiter.ratings);

      waiter.averageRating = waiter.ratings.reduce((sum, r) => sum + r.rating, 0) / waiter.ratings.length;

      await account.save();
      console.log("✅ Guardado exitoso");

      await logAction(client.email, "Valoración añadida", `Mesero: ${waiter.name}, En la cuenta: ${account.name}, Rating: ${rating}, Comentario: ${comment}`);

      // Add activity to client
      client.activities.push({
        type: "rating_given",
        description: `Valoración de ${rating} estrellas para ${waiter.name}`,
        //amount: 0, // No points for 'visits'
        //date: today,
        accountId: account._id,
        //promotionId: promotionId,
      });
      client.save();

      // Enviar correo si es 5 estrellas y existe googleBusiness
      if (rating === 5 && account.landing.googleBusiness) {
        if (!client.email) {
          console.log("⚠️ Email del cliente no disponible");
          throw new Error("Email del cliente no disponible");
        }

        const msg = {
          to: client.email,
          from: {
            email: account.senderEmail || "contacto@fidelidapp.cl",
            name: account.name || "Fidelid",
          },
          subject: "¡Gracias por tu excelente valoración!",
          text: `Hola ${client.name},\n\nMuchas gracias por tu valoración de 5 estrellas para ${waiter.name}. Nos encantaría que compartieras tu experiencia en Google:\n${account.landing.googleBusiness}\n\n¡Gracias por tu apoyo!`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
              <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h2 style="color: #333; text-align: center; margin-bottom: 30px;">¡Gracias por tu excelente valoración!</h2>
                
                <p style="color: #666; font-size: 16px;">Hola ${client.name || "Cliente"},</p>
                
                <p style="color: #666; font-size: 16px;">Muchas gracias por tu valoración de 5 estrellas para ${waiter.name
            }. Nos encantaría que compartieras tu experiencia en Google:</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${account.landing.googleBusiness}" 
                     style="background-color: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                     Valorar en Google
                  </a>
                </div>

                ${account.socialMedia
              ? `
                  <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                    <p style="color: #666; margin-bottom: 15px;">Síguenos en nuestras redes sociales:</p>
                    <div style="text-align: center; width: 100%;">
                      ${account.socialMedia.instagram
                ? `
                        <a href="${account.socialMedia.instagram}" style="display: inline-block; margin: 0 10px;">
                          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/132px-Instagram_logo_2016.svg.png" 
                               alt="Instagram" style="width: 30px; height: 30px;">
                        </a>`
                : ""
              }
                      
                      ${account.socialMedia.facebook
                ? `
                        <a href="${account.socialMedia.facebook}" style="display: inline-block; margin: 0 10px;">
                          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Facebook_Logo_%282019%29.png/132px-Facebook_Logo_%282019%29.png" 
                               alt="Facebook" style="width: 30px; height: 30px;">
                        </a>`
                : ""
              }
                      
                      ${account.socialMedia.website
                ? `
                        <a href="${account.socialMedia.website}" style="display: inline-block; margin: 0 10px;">
                          <img src="https://cdn-icons-png.flaticon.com/512/1006/1006771.png" 
                               alt="Website" style="width: 30px; height: 30px;">
                        </a>`
                : ""
              }
                      
                      ${account.socialMedia.whatsapp
                ? `
                        <a href="https://wa.me/${account.socialMedia.whatsapp}" style="display: inline-block; margin: 0 10px;">
                          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/132px-WhatsApp.svg.png" 
                               alt="WhatsApp" style="width: 30px; height: 30px;">
                        </a>`
                : ""
              }
                    </div>
                  </div>
                `
              : ""
            }
              </div>
            </div>
          `,
        };

        try {
          await sgMail.send(msg);
          console.log("📧 Correo de invitación a Google enviado exitosamente");
        } catch (emailError) {
          console.error("❌ Error al enviar correo:", emailError.response?.body?.errors || emailError);
          // No lanzamos el error para que no afecte al guardado de la valoración
        }
      }

      res.json({
        message: "Valoración añadida exitosamente",
        waiter,
        savedRating: ratingObject,
      });
    } catch (error) {
      console.error("❌ Error en addRating:", error);
      await logAction("sistema", "ERROR_AÑADIR_VALORACION", `Error: ${error.message}`);
      res.status(500).json({ message: "Error al añadir valoración", error: error.message });
    }
  },

  addPoints: async (req, res) => {
    try {
      const { accountId, waiterId } = req.params;
      const { points } = req.body;

      const account = await Account.findById(accountId);
      const waiter = account.landing.waiters.id(waiterId);
      waiter.pointsHistory.push({ points });
      waiter.totalPoints += points;
      await account.save();

      res.json({ message: "Puntos añadidos exitosamente", waiter });
    } catch (error) {
      res.status(500).json({ message: "Error al añadir puntos", error });
    }
  },

  getWaiters: async (req, res) => {
    const { accountId } = req.params;
    const account = await Account.findById(accountId);
    res.json(account.landing.waiters);
  },
};
