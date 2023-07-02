import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";

/* CONFIG */

const app = express();

dotenv.config();

app.use(express.json());
app.use(cors());

const uri = process.env.DATABASE_URL;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

// Função para conectar ao MongoDB
async function connectToDatabase() {
  try {
    await client.connect();
    console.log("Conectado ao MongoDB");
  } catch (error) {
    console.error("Erro ao conectar ao MongoDB:", error);
  }
}

connectToDatabase();

app.listen(5000, () => {
  console.log("Servidor rodando na porta 5000");
});


//POST PARTICIPANTS//


app.post("/participants", async (req, res) => {
    try {
      const { name } = req.body;
  
      // Validar os dados da requisição usando Joi
      const schema = Joi.object({
        name: Joi.string().required(),
      });
  
      const { error } = schema.validate({ name });
  
      if (error) {
        return res.status(422).json({ error: "Nome inválido" });
      }
  
      // Verificar se o nome já está sendo usado
      const db = client.db();
      const participant = await db.collection("participants").findOne({ name });
  
      if (participant) {
        return res.status(409).json({ error: "Nome já está sendo usado" });
      }
  
      // Salvar o participante na coleção "participants"
      const newParticipant = {
        name,
        lastStatus: Date.now(),
      };
  
      await db.collection("participants").insertOne(newParticipant);
  
      // Salvar mensagem de status na coleção "messages"
      const message = {
        from: name,
        to: "Todos",
        text: "entra na sala...",
        type: "status",
        time: dayjs().format("HH:mm:ss"),
      };
  
      await db.collection("messages").insertOne(message);
  
      res.status(201).end();
    } catch (error) {
      console.error("Erro ao cadastrar participante:", error);
      res.status(500).json({ error: "Erro no servidor" });
    }
  });

  //POST MESSAGES//


  app.post("/messages", async (req, res) => {
    try {
      const { to, text, type } = req.body;
      const from = req.header("User");
  
      // Validar os dados da requisição usando Joi
      const schema = Joi.object({
        to: Joi.string().required(),
        text: Joi.string().required(),
        type: Joi.string().valid("message", "private_message").required(),
      });
  
      const { error } = schema.validate({ to, text, type });
  
      if (error) {
        return res.status(422).json({ error: "Parâmetros inválidos" });
      }
  
      // Verificar se o participante remetente existe na lista de participantes
      const db = client.db();
      const participant = await db.collection("participants").findOne({ name: from });
  
      if (!participant) {
        return res.status(404).json({ error: "Remetente não encontrado" });
      }
  
      // Salvar a mensagem na coleção "messages"
      const message = {
        from,
        to,
        text,
        type,
        time: dayjs().format("HH:mm:ss"),
      };
  
      await db.collection("messages").insertOne(message);
  
      res.status(201).end();
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      res.status(500).json({ error: "Erro no servidor" });
    }
  });
  
  
//POST STATUS//
  
app.post("/status", async (req, res) => {
    try {
      const participantName = req.header("User");
  
      if (!participantName) {
        return res.status(404).end();
      }
  
      const db = client.db();
      const participant = await db.collection("participants").findOne({ name: participantName });
  
      if (!participant) {
        return res.status(404).end();
      }
  
      await db.collection("participants").updateOne(
        { name: participantName },
        { $set: { lastStatus: Date.now() } }
      );
  
      res.status(200).end();
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      res.status(500).json({ error: "Erro no servidor" });
    }
  });

    // GET PARTICIPANTS
app.get("/participants", async (req, res) => {
    try {
      const db = client.db();
      const participants = await db.collection("participants").find().toArray();
    
      res.status(200).json(participants);
    } catch (error) {
      console.error("Erro ao buscar participantes:", error);
      res.status(500).json({ error: "Erro no servidor" });
    }
  });

  // GET MESSAGES 


  app.get("/messages", async (req, res) => {
    try {
      const participantName = req.header("User");
      const limit = parseInt(req.query.limit);
  
      if (isNaN(limit) || limit <= 0) {
        return res.status(422).json({ error: "Parâmetro de limite inválido" });
      }
  
      const db = client.db();
      const query = {
        $or: [
          { to: participantName },
          { from: participantName },
          { to: "Todos" },
          { type: "message" },
        ],
      };
      const options = {
        sort: { time: -1 },
        limit: limit,
      };
  
      const messages = await db.collection("messages").find(query, options).toArray();
  
      res.status(200).json(messages);
    } catch (error) {
      console.error("Erro ao obter mensagens:", error);
      res.status(500).json({ error: "Erro no servidor" });
    }
  });
  
// Função para remover participantes inativos
async function removeInactiveParticipants() {
    try {
      const db = client.db();
      const tenSecondsAgo = Date.now() - 10000; // Tempo limite de 10 segundos atrás
  
      const result = await db.collection("participants").deleteMany({
        lastStatus: { $lt: tenSecondsAgo },
      });
  
      const deletedCount = result.deletedCount;
  
      if (deletedCount > 0) {
        const message = {
          from: "Servidor",
          to: "Todos",
          text: `${deletedCount} participante(s) removido(s) por inatividade`,
          type: "status",
          time: dayjs().format("HH:mm:ss"),
        };
  
        await db.collection("messages").insertOne(message);
      }
    } catch (error) {
      console.error("Erro ao remover participantes inativos:", error);
    }
  }
  
  // Executar a remoção automática a cada 15 segundos
  setInterval(removeInactiveParticipants, 15000);
    
  

