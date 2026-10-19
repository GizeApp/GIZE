-- Productos de supermercado leídos de la foto de la tabla nutricional del envase (cada
-- etiqueta se leyó dos veces por separado y entran solo las que coincidieron). Completan lo
-- que trae el workflow "Importar productos de supermercado" (productos sin la tabla como texto).
-- Valores cada 100 g o 100 ml. Se puede correr más de una vez: no duplica ni pisa lo
-- verificado, lo oculto, lo corregido en el panel (reviewed_at, va después de admin.sql) ni lo
-- que cargaron los usuarios, y no vuelve a cargar los códigos que
-- borró un administrador (los saltea la base, ver products_deleted_guard en
-- productos-admin.sql). Los de abajo sin código sí vuelven si se borraron: para sacarlos para
-- siempre, ocultarlos en vez de borrarlos.
-- Correr con: Actions → "Supabase" → tarea "sql" → archivo supabase/productos-etiquetas.sql

-- Con código de barras (sale al escanear).
insert into public.products (code, name, brand, kcal, protein, carbs, fat, unit, portion, source) values
('7622201736033','Galletitas crackers Cerealitas clásicas','Cerealitas',429,10.3,64.7,14.1,'g',34,'gize'),
('7622201806538','Galletitas Oreo Golden Sabor Vainilla Rellenas con Crema','Oreo',500,5.3,65.6,23.8,'g',32,'gize'),
('7622202216473','Gomitas blueberry','Bubbaloo',345,0,85,0,'g',20,'gize'),
('7622202247316','Caramelos Halls Menta Lyptus','Halls',389,0,95.2,0,'g',25,'gize'),
('7622202247361','Caramelos Halls Sandía','Halls',385,0,95.2,0,'g',25,'gize'),
('7622202247392','Caramelos Halls Menthol','Halls',389,0,95.2,0,'g',25,'gize'),
('7622202288197','Caramelos Clight Naranja','Clight',230,0,95,0,'g',20,'gize'),
('7622202288227','Caramelos Halls Free Cherry','Halls',236,0,98.5,0,'g',20,'gize'),
('7622202288258','Caramelos Halls Free Menta','Halls',236,0,98.5,0,'g',20,'gize'),
('7622202296291','Alfajor Terrabusi Intenso','Terrabusi',395,5.3,60,14,'g',55,'gize'),
('7622202322068','Chocolate Milka relleno dulce de leche','Milka',469,6.2,55.2,24.8,'g',29,'gize'),
('7622202322150','Chocolate Milka aireado con leche','Milka',532,6.8,56,30.4,'g',25,'gize'),
('7622202370021','Alfajor Milka Super Dulce de Leche','Milka',396,7.3,57.1,14.3,'g',70,'gize'),
('7622202370045','Alfajor Milka Super Dulce de Leche Blanco','Milka',403,7.4,55.7,15.7,'g',70,'gize'),
('7622202805554','Alfajor triple blanco','Terrabusi',397,7.6,57.1,14.3,'g',70,'gize'),
('7622202816437','Alfajor triple blanco','Shot',533,8.8,53.3,31.7,'g',60,'gize'),
('7622202830020','Galletitas pancake acaramelado Oreo BTS','Oreo',497,5,65.6,23.1,'g',32,'gize'),
('7790310985434','Papas fritas sabor a jamón serrano','Lays',540,6,52,34,'g',25,'gize'),
('7790310985458','Papas fritas Lays clásicas','Lays',552,6,52,35.6,'g',25,'gize'),
('7790360026583','Hamburguesa','Swift',239,17.5,0,18.8,'g',80,'gize'),
('77903860','Alfajor triple Terrabusi torta','Terrabusi',391,6.7,57.1,14.3,'g',70,'gize'),
('7790742223104','Queso rallado reggianito La Serenísima bolsa','La Serenísima',390,38,0,26,'g',10,'gize'),
('7790742223203','Queso rallado La Serenísima reggianito flow pack','La Serenísima',390,38,0,26,'g',10,'gize'),
('7790742321701','Queso untable Finlandia pote','Finlandia',270,8,3.3,25.3,'g',30,'gize'),
('7790742324009','Finlandia light sin sal agregada','Finlandia',130,9,5.3,8,'g',30,'gize'),
('7790742333605','Leche UAT Zero lactosa La Serenísima','La Serenísima',40,3,4.8,1,'ml',200,'gize'),
('7790742358509','Leche con Prebióticos La Serenísima','La Serenísima',35,3,4.8,0.3,'ml',200,'gize'),
('7790742471307','Queso provoleta','La Serenísima',393,26,0,33.3,'g',30,'gize'),
('7790742625403','Dulce de leche colonial La Serenísima pote','La Serenísima',315,7.5,55,7,'g',20,'gize'),
('7791337007178','Yogur firme vainilla','Gran Compra',54,3.6,10,0,'g',120,'gize'),
('7791337007246','Yogur firme sabor vainilla','Ser',42,4.8,5.8,0,'g',190,'gize'),
('7791337007864','Yogur firme sabor frutilla','Ser',42,4.8,5.8,0,'g',190,'gize'),
('7791337008236','Yogur batido frutilla','Gran Compra',62,3.8,11.7,1,'g',120,'gize'),
('7791337009622','Yogur bebible sabor vainilla','Ser',30,3.4,4,0,'g',200,'gize'),
('7791337009639','Yogur bebible sabor frutilla','Ser',30,3.4,4,0,'g',200,'gize'),
('7791337009943','Yogur Griego sabor frutilla','Yogurísimo',82,6.3,8.6,2.5,'g',140,'gize'),
('7791337009950','Yogur Griego sabor vainilla','Yogurísimo',82,6.3,8.6,2.5,'g',140,'gize'),
('7791337009974','Yogur Griego con Frutilla','Yogurísimo',93,6.6,12.8,1.7,'g',125,'gize'),
('7791337010017','Yogur Griego natural sin endulzar','Yogurísimo',82,6.5,7,3.2,'g',200,'gize'),
('7791337010147','Yogur Griego con Arándanos','Yogurísimo',93,6.6,12.8,1.7,'g',125,'gize'),
('7791720032947','Capelletis Bulnez con 4 quesos en plancha','Bulnez',286,9.2,49,5.7,'g',100,'gize'),
('7791720032978','Ravioles Bulnez de ricota y queso en plancha','Bulnez',236,9.7,44,2.3,'g',100,'gize'),
('7791720032985','Ravioles Bulnez de verdura y queso en plancha','Bulnez',240,8.9,48,1.5,'g',100,'gize'),
('7791720033005','Sorrentinos Bulnez de ricota y jamón','Bulnez',222,9.7,39,3,'g',100,'gize'),
('7791720036365','Jamón cocido feteado','Bulnez',105,16.5,0,3.8,'g',40,'gize'),
('7791720037836','Salchichas clásicas Carrefour Classic flowpack','Carrefour',170,9.4,9,11,'g',50,'gize'),
('7791720038659','Medallón vegetal Carrefour Sentation de arvejas y espina','Carrefour',250,12,47,4.4,'g',100,'gize'),
('7791720038666','Medallón vegetal Carrefour Sentation de lentjas y tomate seco','Carrefour',235,11,48,2.3,'g',100,'gize'),
('7791720038673','Medallón vegetal Carrefour Sentation de aduki y calabaza','Carrefour',220,11,38,3.4,'g',100,'gize'),
('7791720038680','Medallón vegetal Carrefour Sentation de garbanzo y curry','Carrefour',226,9.4,43,4.3,'g',100,'gize'),
('7792180146588','Galletitas Dulce Mamá de canela','9 De Oro',453,7,71,16,'g',30,'gize'),
('7793940052002','Manteca La Serenísima clásica','La Serenísima',740,0,0,82,'g',10,'gize'),
('7794520868952','Palitos salados','Krachitos',544,6.8,48,36,'g',25,'gize'),
('77955173','Barras de frutos secos manzana y chía Zafrán sin gluten','Zafrán',475,18.2,35.7,33.6,'g',28,'gize'),
('7795947005128','Sandwich triple de miga j/q pan blanco','El Mercado',158,11.7,9.2,8.3,'g',120,'gize'),
('7795947005135','Sandwich triple de miga JyQ pan negro','El Mercado',213,12.5,20,9.2,'g',120,'gize'),
('7795947005142','Sandwich triple de miga jc/q pan negro El Mercado','Carrefour',281,11.1,34.1,11.1,'g',135,'gize'),
('7798140257424','Bebida hidratante Suerox manzana','Suerox',0,0,0,0,'ml',200,'gize'),
('7798140257431','Bebida hidratante Suerox arándano pomelo','Suerox',0,0,0,0,'ml',200,'gize'),
('7798420160857','Bebida hidratante Suerox limonada','Suerox',0,0,0,0,'ml',200,'gize'),
('7799037060394','Harina de trigo integral Chacabuco orgánica','Chacabuco',306,12,60,2,'g',50,'gize'),
('8445291395930','Nesquik extra cacao chocolatada listo para tomar','Nesquik',56,4,7.5,1.2,'ml',200,'gize'),
('90415418','Bebida energizante Red Bull Sugar Free','Red Bull',3,0,0,0,'ml',250,'gize')
on conflict (code) do update set name = excluded.name, brand = excluded.brand, kcal = excluded.kcal, protein = excluded.protein,
  carbs = excluded.carbs, fat = excluded.fat, unit = excluded.unit, portion = excluded.portion, source = 'gize'
where products.source in ('off', 'gize') and not products.verified and not products.hidden and products.reviewed_at is null;

-- Sin código propio (quesos que se venden por peso: el código es interno de cada comercio).
insert into public.products (code, name, brand, kcal, protein, carbs, fat, unit, portion, source)
select v.* from (values
(null,'Queso cremoso Cremón','La Serenísima',289,18,1,24,'g',30,'gize'),
(null,'Queso Port Salut La Serenísima sin lactosa','La Serenísima',310,20,1,25,'g',30,'gize'),
(null,'Queso Port Salut Light La Serenísima sin lactosa','La Serenísima',218,27,0.5,12,'g',30,'gize'),
(null,'Queso La Serenísima pategras sin lactosa','La Serenísima',377,27.3,0,29.7,'g',30,'gize'),
(null,'Queso La Serenísima gouda sin lactosa','La Serenísima',353,22.3,0,29,'g',30,'gize'),
(null,'Queso La Serenísima sardo sin lactosa','La Serenísima',393,26,0,32,'g',30,'gize'),
(null,'Queso La Serenísima reggianito sin lactosa','La Serenísima',380,29,0,29,'g',30,'gize'),
(null,'Queso provolone La Serenísima sin lactosa','La Serenísima',393,26,0,33.3,'g',30,'gize'),
(null,'Queso minifynbo La Serenísima sin lactosa','La Serenísima',353,22.3,0,29,'g',30,'gize'),
(null,'Queso Cremón La Serenísima cremoso','La Serenísima',289,18,1,24,'g',30,'gize'),
(null,'Queso cremón light La Serenísima','La Serenísima',236,21,1.3,17,'g',30,'gize'),
(null,'Queso parmesano La Serenísima','La Serenísima',340,30,0,23.7,'g',30,'gize')
) as v(code, name, brand, kcal, protein, carbs, fat, unit, portion, source)
where not exists (select 1 from public.products p where p.code is null and lower(p.name) = lower(v.name) and coalesce(p.brand, '') = coalesce(v.brand, ''));

-- Resumen (solo cantidades).
select source, count(*) as productos from public.products group by source order by source;
